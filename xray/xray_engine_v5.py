#!/usr/bin/env python3
"""
XrayNews - Unified Xray Engine v5
Professional-grade research, verification, and analysis

Improvements over v4:
- Fixed filter bug in fetch_unanalyzed()
- Added rate limiting for external APIs
- Added retry mechanism with exponential backoff
- Added comprehensive logging
- Fixed stale lockfile handling

Usage:
  python xray_engine_v5.py                    # Run all engines
  python xray_engine_v5.py --truth            # Only score stories
  python xray_engine_v5.py --research         # Only research stories
  python xray_engine_v5.py --pin              # Only update pinned stories
  python xray_engine_v5.py --limit 20         # Process 20 stories per engine
"""

import os
import re
import sys
import json
import fcntl
import time
import logging
import requests
from datetime import datetime, timezone
from typing import List, Dict, Any

# Lockfile to prevent concurrent runs
LOCKFILE = '/tmp/xray_engine_v5.lock'

# Setup logging
LOG_DIR = '/a0/usr/workdir/tradingai-repo/xray/logs'
os.makedirs(LOG_DIR, exist_ok=True)

logging.basicConfig(
    filename=os.path.join(LOG_DIR, 'xray_engine.log'),
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)
logger = logging.getLogger(__name__)

def acquire_lock():
    """Acquire exclusive lock to prevent concurrent runs - with stale lockfile handling"""
    # Check for stale lockfile (>1 hour old)
    if os.path.exists(LOCKFILE):
        try:
            age = time.time() - os.path.getmtime(LOCKFILE)
            if age > 3600:  # 1 hour
                os.unlink(LOCKFILE)
                logger.warning(f"Removed stale lockfile (age: {age:.0f}s)")
                print(f"[LOCK] Removed stale lockfile (age: {age:.0f}s)")
        except Exception as e:
            logger.error(f"Error checking lockfile: {e}")
    
    lock_file = open(LOCKFILE, 'w')
    try:
        fcntl.flock(lock_file, fcntl.LOCK_EX | fcntl.LOCK_NB)
        lock_file.write(str(os.getpid()))
        lock_file.flush()
        return lock_file
    except IOError:
        lock_file.close()
        return None

# Import v5 components (with rate limiting)
from research_engine import ResearchEngine
from analysis_generator import ProfessionalAnalysisGenerator
from pin_calculator import PinCalculator

# Load environment
SUPABASE_URL = os.environ.get('SUPABASE_URL', 'https://dkxydhuojaspmbpjfyoz.supabase.co')

def get_service_key():
    key = os.environ.get('SERVICE_ROLE_SUPABASE', '')
    if not key:
        with open('/a0/usr/.env') as f:
            for line in f:
                if line.startswith('SERVICE_ROLE_SUPABASE='):
                    return line.split('=', 1)[1].strip()
    return key

SERVICE_KEY = get_service_key()


# Retry queue for failed stories
FAILED_STORIES = []

def with_retry(func, story, max_retries=3, delay=2):
    """Execute function with exponential backoff retry"""
    story_id = story.get('id', 'unknown')
    headline = story.get('headline', '')[:50]
    
    for attempt in range(max_retries):
        try:
            return func(story)
        except Exception as e:
            if attempt == max_retries - 1:
                FAILED_STORIES.append({
                    'id': story_id,
                    'headline': headline,
                    'error': str(e),
                    'timestamp': datetime.now(timezone.utc).isoformat()
                })
                logger.error(f"Retry failed for {headline}: {e}")
                print(f"  [RETRY FAILED] {headline}: {e}")
                return False
            wait = delay * (2 ** attempt)  # 2, 4, 8 seconds
            logger.warning(f"Retry {attempt+1}/{max_retries} for {headline}, waiting {wait}s")
            print(f"  [RETRY {attempt+1}/{max_retries}] Waiting {wait}s...")
            time.sleep(wait)
    return False


class SupabaseClient:
    """Lightweight Supabase REST client"""
    
    def __init__(self, url: str, key: str):
        self.url = url
        self.key = key
        self.headers = {
            'apikey': key,
            'Authorization': f'Bearer {key}',
            'Content-Type': 'application/json',
            'Prefer': 'return=representation'
        }
    
    def fetch(self, table: str, select: str = '*', filters: Dict = None,
              order: str = None, limit: int = None) -> List[Dict]:
        params = {'select': select}
        if filters:
            for k, v in filters.items():
                params[k] = v
        if order:
            params['order'] = order
        if limit:
            params['limit'] = str(limit)
        
        url = f"{self.url}/rest/v1/{table}"
        resp = requests.get(url, headers=self.headers, params=params)
        
        if resp.status_code != 200:
            raise Exception(f"Fetch failed: {resp.status_code} {resp.text}")
        return resp.json()
    
    def update(self, table: str, id: str, data: Dict) -> bool:
        url = f"{self.url}/rest/v1/{table}?id=eq.{id}"
        resp = requests.patch(url, headers=self.headers, json=data)
        return resp.status_code in [200, 204]


class TruthEngineV5:
    """Truth Engine v5 - Enhanced scoring with retry and logging"""
    
    def __init__(self, db: SupabaseClient):
        self.db = db
        self.research_engine = ResearchEngine()
    
    def fetch_unscored(self, limit: int = 50) -> List[Dict]:
        return self.db.fetch(
            'stories',
            select='id,headline,summary,country_name,category,external_url',
            filters={'or': '(xray_score.is.null,xray_score.eq.0)'},
            order='created_at.desc',
            limit=limit
        )
    
    def calculate_score(self, story: Dict) -> tuple:
        """Calculate truth score with enhanced research"""
        headline = story.get('headline', '')
        summary = story.get('summary', '')
        
        # Get research data
        research = self.research_engine.research_story(headline, summary)
        
        # Base score
        score = 40
        verdict = "UNVERIFIED"
        
        # Source quality bonus
        tier1 = research.get('tier1_count', 0)
        if tier1 >= 3:
            score += 25
        elif tier1 >= 1:
            score += 15
        
        # Fact-check bonus
        if research.get('fact_check_count', 0) > 0:
            score += 10
        
        # Official source bonus
        if research.get('official_count', 0) > 0:
            score += 10
        
        # Source volume bonus
        total_sources = research.get('source_count', 0)
        if total_sources >= 10:
            score += 10
        elif total_sources >= 5:
            score += 5
        
        # Determine verdict
        if score >= 70:
            verdict = "VERIFIED"
        elif score >= 55:
            verdict = "MOSTLY VERIFIED"
        elif score >= 40:
            verdict = "UNVERIFIED"
        else:
            verdict = "CONTESTED"
        
        return min(score, 100), verdict, research
    
    # Non-news patterns learned from cleanup (March 2026)
    NON_NEWS_PATTERNS = [
        # Personal advice
        r'pick.*name', r'choose.*name', r'help me.*choose', r'which.*should i',
        r'should i.*or', r'living with.*in.*law', r'thoughts on.*professor',
        r'what do you think', r'am i the.*asshole', r'\baita\b',
        r'relationship.*advice', r'dating.*advice', r'need.*advice',
        r'career.*advice', r'job.*advice', r'interview.*tips',
        # Discussion threads
        r'megathread', r'daily.*thread', r'weekly.*thread', r'discussion.*thread',
        r'free talk', r'casual.*conversation', r'just.*curious',
        r'anyone.*else', r'does anyone', r'what.*your.*favorite',
        # PSA/Mod posts
        r'^psa:', r'^note:', r'^reminder:', r'^meta:', r'mod.*post',
        r'subreddit.*rule', r'off-topic',
        # Requests
        r'translate.*please', r'translation.*request', r'what does.*mean',
        r'can someone.*explain', r'question about', r'looking for.*recommendation',
        # Travel/Living
        r'travel.*tips', r'travel.*itinerary', r'tourist.*advice',
        r'cost of living', r'apartment.*search', r'housing.*advice',
        r'best.*neighborhood', r'where.*live', r'moving to',
        # Education/Career
        r'study.*abroad', r'student.*visa', r'university.*admission',
        r'college.*application', r'how.*get.*job', r'salary.*question',
        # Shopping/Reviews
        r'worth.*buying', r'should.*buy', r'review.*my', r'rate my',
        r'is it.*worth',
    ]
    NON_NEWS_COMPILED = None  # Compiled at runtime

    def is_quality_story(self, story: Dict) -> bool:
        """Filter out low-quality/junk stories before expensive research"""
        headline = story.get('headline', '') or ''
        summary = story.get('summary', '') or ''
        combined = (headline + ' ' + summary).lower()

        # Compile patterns once
        if self.__class__.NON_NEWS_COMPILED is None:
            self.__class__.NON_NEWS_COMPILED = [
                re.compile(p, re.IGNORECASE) for p in self.__class__.NON_NEWS_PATTERNS
            ]

        # Skip very short headlines
        if len(headline) < 15:
            return False

        # Check non-news patterns
        for pattern in self.__class__.NON_NEWS_COMPILED:
            if pattern.search(combined):
                return False

        # Skip social posts with no country context (Reddit junk)
        source_type = story.get('source_type', 'legacy')
        country = story.get('country_name', '') or ''
        if source_type == 'social' and country in ['', 'World', None]:
            return False

        return True

    def _do_score_story(self, story: Dict) -> bool:
        """Internal scoring logic (used by retry wrapper)"""
        story_id = story['id']
        headline = story.get('headline', '')
        
        score, verdict, research = self.calculate_score(story)
        
        # Update database
        success = self.db.update('stories', story_id, {
            'xray_score': score,
            'xray_verdict': verdict,
            'status': 'verified' if score >= 55 else 'unverified'
        })
        
        if success:
            logger.info(f"Scored story {story_id}: {score} - {verdict}")
        
        return success
    
    def score_story(self, story: Dict) -> bool:
        """Score a single story with retry wrapper"""
        story_id = story['id']
        headline = story.get('headline', '')
        
        # Skip junk stories
        if not self.is_quality_story(story):
            logger.info(f"Skipping junk story: {headline[:50]}")
            print(f"[TRUTH] Skipping junk: {headline[:50]}")
            return False
        
        print(f"[TRUTH] Scoring: {headline[:50]}...")
        logger.info(f"Scoring story: {headline[:50]}")
        
        return with_retry(self._do_score_story, story)
    
    def run(self, limit: int = 20, verbose: bool = True) -> int:
        """Run truth engine on unscored stories"""
        if verbose:
            print("="*60)
            print("TRUTH ENGINE v5")
            print("="*60)
        
        logger.info(f"Truth Engine v5 started - limit={limit}")
        
        stories = self.fetch_unscored(limit)
        if verbose:
            print(f"\nFound {len(stories)} unscored stories")
        
        scored = 0
        for story in stories:
            if self.score_story(story):
                scored += 1
        
        if verbose:
            print(f"\nScored: {scored} stories")
        
        logger.info(f"Truth Engine v5 completed - scored={scored}")
        return scored


class AnalysisEngineV5:
    """Analysis Engine v5 - Professional summaries with fixed filter"""
    
    def __init__(self, db: SupabaseClient):
        self.db = db
        self.research_engine = ResearchEngine()
        self.analysis_generator = ProfessionalAnalysisGenerator()
    
    def fetch_unanalyzed(self, limit: int = 10) -> List[Dict]:
        # FIXED: Changed xray_analysis.eq. to xray_analysis.eq."" (proper PostgREST syntax)
        return self.db.fetch(
            'stories',
            select='id,headline,summary,country_name,country_code,category,source_type',
            filters={'or': '(xray_analysis.is.null,xray_analysis.eq."",xray_analysis_version.lt.5)'},
            order='created_at.desc',
            limit=limit
        )
    
    def _do_analyze_story(self, story: Dict) -> bool:
        """Internal analysis logic (used by retry wrapper)"""
        story_id = story['id']
        headline = story.get('headline', '')
        summary = story.get('summary', '')
        
        # Get research
        research = self.research_engine.research_story(headline, summary)
        
        # Find related stories
        related = self.research_engine.find_related_stories(
            story_id,
            research.get('entities', {})
        )
        
        # Generate analysis
        analysis = self.analysis_generator.generate_analysis(
            headline=headline,
            summary=summary,
            research=research,
            related_stories=related
        )
        
        # Update database
        success = self.db.update('stories', story_id, {
            'xray_analysis': analysis,
            'xray_analysis_version': 5,
            'xray_analysis_at': datetime.now(timezone.utc).isoformat()
        })
        
        if success:
            logger.info(f"Analyzed story {story_id}")
        
        return success
    
    def analyze_story(self, story: Dict) -> bool:
        """Generate professional analysis for a story with retry"""
        story_id = story['id']
        headline = story.get('headline', '')
        
        print(f"[ANALYSIS] Analyzing: {headline[:50]}...")
        logger.info(f"Analyzing story: {headline[:50]}")
        
        return with_retry(self._do_analyze_story, story)
    
    def run(self, limit: int = 10, verbose: bool = True) -> int:
        """Run analysis engine on unanalyzed stories"""
        if verbose:
            print("="*60)
            print("ANALYSIS ENGINE v5")
            print("="*60)
        
        logger.info(f"Analysis Engine v5 started - limit={limit}")
        
        stories = self.fetch_unanalyzed(limit)
        if verbose:
            print(f"\nFound {len(stories)} stories needing analysis")
        
        analyzed = 0
        for story in stories:
            if self.analyze_story(story):
                analyzed += 1
        
        if verbose:
            print(f"\nAnalyzed: {analyzed} stories")
        
        logger.info(f"Analysis Engine v5 completed - analyzed={analyzed}")
        return analyzed


class XrayEngineV5:
    """Main orchestrator for Xray v5"""
    
    def __init__(self):
        self.db = SupabaseClient(SUPABASE_URL, SERVICE_KEY)
        self.truth_engine = TruthEngineV5(self.db)
        self.analysis_engine = AnalysisEngineV5(self.db)
        self.pin_calculator = PinCalculator()
    
    def run_all(self, limit: int = 20, verbose: bool = True):
        """Run all engines"""
        if verbose:
            print("\n" + "="*60)
            print("XRAY ENGINE v5 - UNIFIED")
            print(f"Time: {datetime.now().isoformat()}")
            print("="*60)
        
        logger.info(f"Xray Engine v5 started - limit={limit}")
        
        results = {
            'scored': 0,
            'analyzed': 0,
            'pinned': 0,
            'failed': 0
        }
        
        # Run Truth Engine
        results['scored'] = self.truth_engine.run(limit=limit, verbose=verbose)
        
        # Run Analysis Engine
        results['analyzed'] = self.analysis_engine.run(limit=limit, verbose=verbose)
        
        # Update pinned stories
        results['pinned'] = self.pin_calculator.run(top_n=3, verbose=verbose)
        
        # Report failed stories
        results['failed'] = len(FAILED_STORIES)
        if FAILED_STORIES:
            logger.warning(f"Failed stories: {len(FAILED_STORIES)}")
            if verbose:
                print(f"\n⚠️  Failed stories: {len(FAILED_STORIES)}")
                for fs in FAILED_STORIES:
                    print(f"   - {fs['headline']}: {fs['error']}")
        
        if verbose:
            print("\n" + "="*60)
            print("RESULTS SUMMARY")
            print("="*60)
            print(f"Stories scored: {results['scored']}")
            print(f"Stories analyzed: {results['analyzed']}")
            print(f"Stories pinned: {results['pinned']}")
            if results['failed']:
                print(f"Stories failed: {results['failed']}")
        
        logger.info(f"Xray Engine v5 completed - scored={results['scored']}, analyzed={results['analyzed']}, pinned={results['pinned']}, failed={results['failed']}")
        
        return results
    
    def run_truth_only(self, limit: int = 20, verbose: bool = True):
        return self.truth_engine.run(limit=limit, verbose=verbose)
    
    def run_analysis_only(self, limit: int = 10, verbose: bool = True):
        return self.analysis_engine.run(limit=limit, verbose=verbose)
    
    def run_pin_only(self, verbose: bool = True):
        return self.pin_calculator.run(top_n=3, verbose=verbose)


if __name__ == '__main__':
    import argparse
    
    parser = argparse.ArgumentParser(description='Xray Engine v5')
    parser.add_argument('--truth', action='store_true', help='Run only Truth Engine')
    parser.add_argument('--research', action='store_true', help='Run only Analysis Engine')
    parser.add_argument('--pin', action='store_true', help='Run only Pin Calculator')
    parser.add_argument('--limit', type=int, default=10, help='Max stories per engine')
    parser.add_argument('--quiet', action='store_true', help='Less output')
    
    args = parser.parse_args()
    
    # Acquire lock
    lock = acquire_lock()
    if not lock:
        print("Another instance is already running. Exiting.")
        logger.warning("Attempted to start but another instance already running")
        sys.exit(1)
    
    try:
        engine = XrayEngineV5()
        
        if args.truth:
            engine.run_truth_only(limit=args.limit, verbose=not args.quiet)
        elif args.research:
            engine.run_analysis_only(limit=args.limit, verbose=not args.quiet)
        elif args.pin:
            engine.run_pin_only(verbose=not args.quiet)
        else:
            engine.run_all(limit=args.limit, verbose=not args.quiet)
    finally:
        # Release lock
        if lock:
            fcntl.flock(lock, fcntl.LOCK_UN)
            lock.close()
            try:
                os.unlink(LOCKFILE)
            except:
                pass
