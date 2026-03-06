#!/usr/bin/env python3
"""
XrayNews - Unified Xray Engine
Combines: Truth Engine + Story Threader + Analysis Engine

Usage:
  python xray_engine.py                    # Run all engines
  python xray_engine.py --truth            # Only score stories
  python xray_engine.py --thread           # Only link stories
  python xray_engine.py --analyze          # Only generate analyses
  python xray_engine.py --limit 20         # Process 20 stories per engine
"""

import os
import sys
import json
import requests
import re
import hashlib
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any, Tuple
from collections import defaultdict

# ============================================
# CONFIGURATION
# ============================================

SUPABASE_URL = os.environ.get('SUPABASE_URL', 'https://dkxydhuojaspmbpjfyoz.supabase.co')
SERVICE_KEY = os.environ.get('SERVICE_ROLE_SUPABASE', '')

def get_service_key():
    """Get service key from environment or .env file"""
    key = os.environ.get('SERVICE_ROLE_SUPABASE', '')
    if not key:
        # Try loading from .env
        env_paths = ['/a0/usr/.env', '.env']
        for path in env_paths:
            if os.path.exists(path):
                with open(path, 'r') as f:
                    for line in f:
                        if line.startswith('SERVICE_ROLE_SUPABASE='):
                            key = line.split('=', 1)[1].strip()
                            break
    return key

SERVICE_KEY = get_service_key()

# ============================================
# SUPABASE CLIENT
# ============================================

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
        """Fetch records from table"""
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
        """Update a single record"""
        url = f"{self.url}/rest/v1/{table}?id=eq.{id}"
        resp = requests.patch(url, headers=self.headers, json=data)
        return resp.status_code in [200, 204]
    
    def upsert(self, table: str, data: Dict) -> Dict:
        """Insert or update record"""
        url = f"{self.url}/rest/v1/{table}"
        headers = {**self.headers, 'Prefer': 'resolution=merge-duplicates,return=representation'}
        resp = requests.post(url, headers=headers, json=data)
        if resp.status_code not in [200, 201]:
            raise Exception(f"Upsert failed: {resp.status_code} {resp.text}")
        return resp.json()[0] if resp.json() else None


# ============================================
# TRUTH ENGINE - Scoring Stories
# ============================================

class TruthEngine:
    """Assigns confidence scores and verdicts to stories"""
    
    # Source credibility tiers
    TIER_1_SOURCES = ['reuters', 'associated press', 'ap news', 'bbc news', 
                      'the guardian', 'npr', 'wall street journal', 'economist']
    TIER_2_SOURCES = ['al jazeera', 'dw', 'france24', 'sky news', 'euronews', 
                      'rfi', 'the times', 'financial times', 'washington post']
    
    # Official signal keywords
    OFFICIAL_KEYWORDS = [
        'pentagon', 'white house', 'kremlin', 'nato', 'un security council',
        'foreign ministry', 'defense ministry', 'state department', 'eu commission',
        'official statement', 'press secretary', 'spokesperson confirmed'
    ]
    
    # Verification keywords
    VERIFY_KEYWORDS = [
        'confirmed', 'verified', 'announced', 'released statement',
        'official report', 'data shows', 'evidence suggests', 'according to officials'
    ]
    
    # Red flag keywords
    RED_FLAGS = [
        'allegedly', 'reportedly', 'claims', 'unconfirmed', 'sources say',
        'rumored', 'speculation', 'may have', 'could be', 'unverified reports'
    ]
    
    def __init__(self, db: SupabaseClient):
        self.db = db
    
    def fetch_unscored(self, limit: int = 50) -> List[Dict]:
        """Fetch stories that need scoring"""
        return self.db.fetch(
            'stories',
            select='id,headline,summary,source_name,category,confidence_score,is_breaking',
            filters={'or': '(xray_score.is.null,xray_score.lt.1)'},
            order='created_at.desc',
            limit=limit
        )
    
    def calculate_score(self, story: Dict) -> Tuple[int, str]:
        """Calculate xray_score and xray_verdict"""
        headline = (story.get('headline') or '').lower()
        summary = (story.get('summary') or '').lower()
        source = (story.get('source_name') or '').lower()
        is_breaking = story.get('is_breaking', False)
        worker_score = story.get('confidence_score', 40)
        
        text = f"{headline} {summary}"
        score = 40  # Base
        
        # Source credibility bonus
        if any(t1 in source for t1 in self.TIER_1_SOURCES):
            score += 20
        elif any(t2 in source for t2 in self.TIER_2_SOURCES):
            score += 12
        
        # Official signals
        official_count = sum(1 for kw in self.OFFICIAL_KEYWORDS if kw in text)
        score += min(official_count * 4, 16)
        
        # Verification keywords
        verify_count = sum(1 for kw in self.VERIFY_KEYWORDS if kw in text)
        score += min(verify_count * 3, 12)
        
        # Breaking news bonus
        if is_breaking:
            score += 5
        
        # Worker confidence bonus
        if worker_score >= 70:
            score += 10
        elif worker_score >= 55:
            score += 5
        
        # Red flags penalty
        red_flag_count = sum(1 for rf in self.RED_FLAGS if rf in text)
        score -= min(red_flag_count * 5, 20)
        
        # Clamp score
        score = max(0, min(100, score))
        
        # Generate verdict
        if score >= 75:
            verdict = "High confidence: Multiple credible sources confirm this report."
        elif score >= 55:
            verdict = "Moderate confidence: Report appears credible but warrants verification."
        elif score >= 35:
            verdict = "Low confidence: Limited verification; treat with caution."
        else:
            verdict = "Unverified: Insufficient evidence or conflicting reports."
        
        return score, verdict
    
    def score_story(self, story: Dict) -> bool:
        """Score a single story"""
        score, verdict = self.calculate_score(story)
        status = 'verified' if score >= 50 else 'unverified'
        
        return self.db.update('stories', story['id'], {
            'xray_score': score,
            'xray_verdict': verdict,
            'status': status
        })
    
    def run(self, limit: int = 50, verbose: bool = True) -> int:
        """Run truth engine on unscored stories"""
        stories = self.fetch_unscored(limit)
        if not stories:
            if verbose:
                print("[TRUTH] No stories need scoring")
            return 0
        
        success = 0
        for i, story in enumerate(stories):
            headline = story.get('headline', '')[:50]
            if verbose:
                print(f"[TRUTH {i+1}/{len(stories)}] Scoring: {headline}...")
            
            if self.score_story(story):
                score, verdict = self.calculate_score(story)
                if verbose:
                    print(f"         Score: {score} | {verdict[:40]}...")
                success += 1
        
        return success


# ============================================
# STORY THREADER - Linking Related Stories
# ============================================

class StoryThreader:
    """Groups related stories into threads"""
    
    # Entity patterns for matching
    COUNTRY_ALIASES = {
        'israel': ['israel', 'idf', 'tel aviv', 'jerusalem'],
        'iran': ['iran', 'tehran', 'irgc', 'iranian'],
        'ukraine': ['ukraine', 'kyiv', 'kiev', 'zelensky'],
        'russia': ['russia', 'moscow', 'kremlin', 'putin'],
        'usa': ['usa', 'united states', 'us ', 'washington', 'pentagon', 'white house'],
        'china': ['china', 'beijing', 'ccp', 'xi jinping'],
        'gaza': ['gaza', 'hamas', 'palestine', 'palestinian'],
        'lebanon': ['lebanon', 'beirut', 'hezbollah'],
        'yemen': ['yemen', 'houthi', 'houthis'],
        'syria': ['syria', 'damascus', 'assad'],
    }
    
    TOPIC_KEYWORDS = [
        'war', 'conflict', 'attack', 'strike', 'ceasefire', 'peace',
        'election', 'vote', 'summit', 'treaty', 'sanctions', 'nuclear',
        'invasion', 'offensive', 'humanitarian', 'refugee', 'military'
    ]
    
    def __init__(self, db: SupabaseClient):
        self.db = db
    
    def extract_entities(self, text: str) -> Dict[str, List[str]]:
        """Extract countries and topics from text"""
        text = text.lower()
        countries = []
        topics = []
        
        for country, aliases in self.COUNTRY_ALIASES.items():
            if any(alias in text for alias in aliases):
                countries.append(country)
        
        for topic in self.TOPIC_KEYWORDS:
            if topic in text:
                topics.append(topic)
        
        return {'countries': countries, 'topics': topics}
    
    def calculate_similarity(self, s1: Dict, s2: Dict) -> float:
        """Calculate similarity score between two stories"""
        score = 0.0
        
        # Country overlap
        c1 = set(self.extract_entities(s1.get('headline', '')).get('countries', []))
        c2 = set(self.extract_entities(s2.get('headline', '')).get('countries', []))
        if c1 and c2 and c1 & c2:
            score += 0.4
        
        # Topic overlap
        t1 = set(self.extract_entities(s1.get('headline', '')).get('topics', []))
        t2 = set(self.extract_entities(s2.get('headline', '')).get('topics', []))
        if t1 and t2 and t1 & t2:
            score += 0.3
        
        # Same category
        if s1.get('category') and s1.get('category') == s2.get('category'):
            score += 0.2
        
        # Text similarity (simple word overlap)
        words1 = set(s1.get('headline', '').lower().split())
        words2 = set(s2.get('headline', '').lower().split())
        overlap = len(words1 & words2)
        if overlap >= 2:
            score += min(overlap * 0.05, 0.2)
        
        return score
    
    def generate_thread_id(self, story_ids: List[str]) -> str:
        """Generate deterministic thread ID"""
        sorted_ids = sorted(story_ids)
        hash_input = '|'.join(sorted_ids)
        return hashlib.md5(hash_input.encode()).hexdigest()[:12]
    
    def fetch_unthreaded(self, limit: int = 100) -> List[Dict]:
        """Fetch stories without threads"""
        return self.db.fetch(
            'stories',
            select='id,headline,category,country_code,created_at',
            filters={'story_thread_id': 'is.null'},
            order='created_at.desc',
            limit=limit
        )
    
    def run(self, limit: int = 100, verbose: bool = True) -> int:
        """Thread unthreaded stories"""
        stories = self.fetch_unthreaded(limit)
        if not stories:
            if verbose:
                print("[THREAD] No stories need threading")
            return 0
        
        # Build thread groups
        thread_groups = defaultdict(list)
        processed = set()
        
        for story in stories:
            if story['id'] in processed:
                continue
            
            group = [story]
            processed.add(story['id'])
            
            # Find similar stories
            for other in stories:
                if other['id'] in processed:
                    continue
                
                sim = self.calculate_similarity(story, other)
                if sim >= 0.5:
                    group.append(other)
                    processed.add(other['id'])
            
            if len(group) >= 2:
                thread_id = self.generate_thread_id([s['id'] for s in group])
                for s in group:
                    thread_groups[thread_id].append(s)
        
        # Update database
        updated = 0
        for thread_id, group in thread_groups.items():
            for story in group:
                if self.db.update('stories', story['id'], {'story_thread_id': thread_id}):
                    updated += 1
                    if verbose and updated <= 5:
                        print(f"[THREAD] {story.get('headline', '')[:40]}... → {thread_id}")
        
        if verbose and updated > 5:
            print(f"[THREAD] ... and {updated - 5} more")
        
        return updated


# ============================================
# ANALYSIS ENGINE - Independent Summaries
# ============================================

class AnalysisEngine:
    """Generates independent AI analysis with real web research"""

    # Verification status constants
    STATUS_CONFIRMED = "✅ CONFIRMED"
    STATUS_UNVERIFIED = "❓ UNVERIFIED"  
    STATUS_CONTESTED = "⚠️ CONTESTED"
    STATUS_INSUFFICIENT = "❌ INSUFFICIENT EVIDENCE"

    def __init__(self, db: SupabaseClient):
        self.db = db

    def fetch_unanalyzed(self, limit: int = 10) -> List[Dict]:
        """Fetch stories needing fresh analysis (v2)"""
        return self.db.fetch(
            'stories',
            select='id,headline,summary,country_name,category',
            filters={'or': '(xray_analysis.is.null,xray_analysis.eq."",xray_analysis_version.lt.2)'},
            order='created_at.desc',
            limit=limit
        )

    def search_web(self, query: str) -> List[Dict]:
        """Search web using DuckDuckGo HTML"""
        results = []
        try:
            url = f"https://html.duckduckgo.com/html/?q={requests.utils.quote(query)}"
            headers = {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html'
            }
            resp = requests.get(url, headers=headers, timeout=15)

            if resp.status_code == 200:
                # Parse results
                titles = re.findall(r'<a[^>]*class="result__a"[^>]*>([^<]+)</a>', resp.text)
                snippets = re.findall(r'<a[^>]*class="result__snippet"[^>]*>([^<]+)</a>', resp.text)

                for title, snippet in zip(titles[:5], snippets[:5]):
                    if title.strip() and snippet.strip():
                        results.append({
                            'title': title.strip(),
                            'snippet': snippet.strip()
                        })
        except Exception as e:
            print(f"[SEARCH ERROR] {e}")

        return results

    def extract_keywords(self, headline: str) -> List[str]:
        """Extract key search terms from headline"""
        # Remove noise words
        noise = ['breaking', 'shocking', 'bombshell', 'massive', 'major', 'huge', 
                 'urgent', 'alert', 'update', 'just in', 'exclusive', 'reported']
        clean = headline.lower()
        for word in noise:
            clean = re.sub(rf'\b{word}\b', '', clean)

        # Extract meaningful words
        words = re.findall(r'\b[a-z]{3,}\b|\b\d+\b', clean)

        # Filter common words
        common = {'the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 
                  'can', 'had', 'her', 'was', 'one', 'our', 'out', 'has', 'have'}
        keywords = [w for w in words if w not in common]

        return keywords[:8]

    def generate_search_queries(self, headline: str, country: str = "") -> List[str]:
        """Generate multiple search queries for cross-verification"""
        keywords = self.extract_keywords(headline)

        queries = []

        # Query 1: Core headline search
        core_terms = ' '.join(keywords[:5])
        if country:
            core_terms += f' {country}'
        queries.append(core_terms)

        # Query 2: With "news" modifier
        if len(keywords) >= 3:
            queries.append(' '.join(keywords[:4]) + ' news')

        # Query 3: Verification search
        if len(keywords) >= 2:
            queries.append(' '.join(keywords[:3]) + ' confirmed')

        return queries[:3]

    def assess_credibility(self, results: List[Dict], original_headline: str) -> tuple:
        """Assess if sources confirm, contest, or don't support the story"""
        if not results:
            return self.STATUS_INSUFFICIENT, [], []

        confirming = []
        conflicting = []

        # Keywords that suggest confirmation
        confirm_words = ['confirmed', 'reports', 'announced', 'official', 'according to',
                        'statement', 'authorities', 'verified', 'sources say']

        # Keywords that suggest conflict
        conflict_words = ['denied', 'false', 'debunked', 'disputed', 'unverified',
                         'no evidence', 'claims', 'allegedly', 'unconfirmed']

        headline_keywords = set(self.extract_keywords(original_headline))

        for r in results:
            title = r.get('title', '').lower()
            snippet = r.get('snippet', '').lower()
            combined = title + ' ' + snippet

            # Check keyword overlap
            result_words = set(self.extract_keywords(r.get('title', '')))
            overlap = len(headline_keywords & result_words)

            if overlap >= 2:
                has_confirm = any(w in combined for w in confirm_words)
                has_conflict = any(w in combined for w in conflict_words)

                if has_confirm and not has_conflict:
                    confirming.append(r)
                elif has_conflict and not has_confirm:
                    conflicting.append(r)
                elif overlap >= 3:
                    confirming.append(r)

        # Determine status
        if confirming and not conflicting:
            return self.STATUS_CONFIRMED, confirming, conflicting
        elif conflicting and not confirming:
            return self.STATUS_CONTESTED, confirming, conflicting
        elif confirming and conflicting:
            return self.STATUS_CONTESTED, confirming, conflicting
        else:
            return self.STATUS_UNVERIFIED, confirming, conflicting

    def generate_analysis(self, story: Dict) -> str:
        """Generate comprehensive analysis with real research"""
        headline = story.get('headline', '')
        country = story.get('country_name', '')

        print(f"[RESEARCH] Searching for: {headline[:60]}...")

        # Generate search queries
        queries = self.generate_search_queries(headline, country)

        # Collect all results
        all_results = []
        seen_titles = set()

        for query in queries:
            print(f"[SEARCH] {query[:50]}...")
            results = self.search_web(query)
            for r in results:
                title_key = r['title'].lower()[:50]
                if title_key not in seen_titles:
                    seen_titles.add(title_key)
                    all_results.append(r)

        print(f"[FOUND] {len(all_results)} unique sources")

        # Assess credibility
        status, confirming, conflicting = self.assess_credibility(all_results, headline)

        # Build analysis output
        lines = []
        lines.append(f"**VERIFICATION: {status}**")
        lines.append("")

        # What the story claims
        clean_headline = headline
        for word in ['BREAKING:', 'SHOCKING:', 'URGENT:', 'ALERT:']:
            clean_headline = clean_headline.replace(word, '')
        clean_headline = re.sub(r'\s+', ' ', clean_headline).strip()
        lines.append(f"**Claim:** {clean_headline}")
        lines.append("")

        # Supporting evidence
        if confirming:
            lines.append("**Supporting Sources:**")
            for r in confirming[:3]:
                source = r['title'][:60]
                snippet = r['snippet'][:80]
                lines.append(f"• {source}: {snippet}...")
            lines.append("")

        # Conflicting evidence
        if conflicting:
            lines.append("**Conflicting Reports:**")
            for r in conflicting[:2]:
                source = r['title'][:60]
                snippet = r['snippet'][:80]
                lines.append(f"• {source}: {snippet}...")
            lines.append("")

        # Conclusion
        lines.append("**Xray Conclusion:**")

        if status == self.STATUS_CONFIRMED:
            lines.append(f"Story verified by {len(confirming)} independent source(s). "
                        f"Claims appear accurate based on available reporting.")
        elif status == self.STATUS_CONTESTED:
            lines.append(f"Mixed reporting found. {len(confirming)} source(s) support, "
                        f"{len(conflicting)} contest. Exercise caution.")
        elif status == self.STATUS_INSUFFICIENT:
            lines.append("No independent sources found covering this story. "
                        f"Unable to verify claims. Story may be unreported or inaccurate.")
        else:  # UNVERIFIED
            lines.append(f"Insufficient independent coverage found. "
                        f"Cannot confirm or deny claims at this time.")

        return '\n'.join(lines)

    def run(self, limit: int = 10, verbose: bool = True) -> int:
        """Run analysis on stories"""
        stories = self.fetch_unanalyzed(limit)
        if not stories:
            if verbose:
                print("[ANALYSIS] No stories need analysis")
            return 0

        success = 0
        for i, story in enumerate(stories):
            headline = story.get('headline', '')[:50]
            if verbose:
                print(f"\n[ANALYSIS {i+1}/{len(stories)}] {headline}...")

            analysis = self.generate_analysis(story)

            if self.db.update('stories', story['id'], {
                'xray_analysis': analysis,
                'xray_analysis_at': datetime.now(timezone.utc).isoformat(),
                'xray_analysis_version': 2
            }):
                if verbose:
                    print(f"[SAVED] Analysis v2 stored")
                success += 1

        return success



class XrayEngine:
    """Unified Xray Engine - combines all processing"""
    
    def __init__(self):
        self.db = SupabaseClient(SUPABASE_URL, SERVICE_KEY)
        self.truth = TruthEngine(self.db)
        self.threader = StoryThreader(self.db)
        self.analysis = AnalysisEngine(self.db)
    
    def run_all(self, limit: int = 20, verbose: bool = True):
        """Run all engines in sequence"""
        print("\n" + "=" * 60)
        print("XRAY UNIFIED ENGINE")
        print("=" * 60)
        print(f"Started: {datetime.now().isoformat()}")
        print(f"Limit per engine: {limit}")
        print("=" * 60)
        
        results = {}
        
        # 1. Truth Engine
        print("\n[1/3] TRUTH ENGINE - Scoring stories...")
        results['truth'] = self.truth.run(limit=limit, verbose=verbose)
        print(f"      ✓ Scored {results['truth']} stories")
        
        # 2. Story Threader
        print("\n[2/3] STORY THREADER - Linking related stories...")
        results['threaded'] = self.threader.run(limit=limit*2, verbose=verbose)
        print(f"      ✓ Threaded {results['threaded']} stories")
        
        # 3. Analysis Engine
        print("\n[3/3] ANALYSIS ENGINE - Generating independent summaries...")
        results['analyzed'] = self.analysis.run(limit=limit, verbose=verbose)
        print(f"      ✓ Analyzed {results['analyzed']} stories")
        
        print("\n" + "=" * 60)
        print("COMPLETE")
        print(f"  Scored: {results['truth']} | Threaded: {results['threaded']} | Analyzed: {results['analyzed']}")
        print("=" * 60)
        
        return results


def main():
    import argparse
    parser = argparse.ArgumentParser(description='Xray Unified Engine')
    parser.add_argument('--truth', action='store_true', help='Run only Truth Engine')
    parser.add_argument('--thread', action='store_true', help='Run only Story Threader')
    parser.add_argument('--analyze', action='store_true', help='Run only Analysis Engine')
    parser.add_argument('--limit', type=int, default=20, help='Max stories per engine')
    parser.add_argument('--quiet', action='store_true', help='Less output')
    args = parser.parse_args()
    
    engine = XrayEngine()
    verbose = not args.quiet
    
    if args.truth:
        engine.truth.run(limit=args.limit, verbose=verbose)
    elif args.thread:
        engine.threader.run(limit=args.limit*2, verbose=verbose)
    elif args.analyze:
        engine.analysis.run(limit=args.limit, verbose=verbose)
    else:
        engine.run_all(limit=args.limit, verbose=verbose)


if __name__ == '__main__':
    main()
