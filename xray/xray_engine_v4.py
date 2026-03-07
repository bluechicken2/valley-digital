#!/usr/bin/env python3
"""
XrayNews - Unified Xray Engine v4
Professional-grade research, verification, and analysis

Usage:
  python xray_engine_v4.py                    # Run all engines
  python xray_engine_v4.py --truth            # Only score stories
  python xray_engine_v4.py --research         # Only research stories
  python xray_engine_v4.py --pin              # Only update pinned stories
  python xray_engine_v4.py --limit 20         # Process 20 stories per engine
"""

import os
import sys
import json
import requests
from datetime import datetime, timezone
from typing import List, Dict, Any

# Import v4 components
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


class TruthEngineV4:
    """Truth Engine v4 - Enhanced scoring"""
    
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
    
    def score_story(self, story: Dict) -> bool:
        """Score a single story"""
        story_id = story['id']
        headline = story.get('headline', '')
        
        print(f"[TRUTH] Scoring: {headline[:50]}...")
        
        try:
            score, verdict, research = self.calculate_score(story)
            
            # Update database
            return self.db.update('stories', story_id, {
                'xray_score': score,
                'xray_verdict': verdict,
                'status': 'verified' if score >= 55 else 'unverified'
            })
        except Exception as e:
            print(f"  [ERROR] {e}")
            return False
    
    def run(self, limit: int = 20, verbose: bool = True) -> int:
        """Run truth engine on unscored stories"""
        if verbose:
            print("="*60)
            print("TRUTH ENGINE v4")
            print("="*60)
        
        stories = self.fetch_unscored(limit)
        if verbose:
            print(f"\nFound {len(stories)} unscored stories")
        
        scored = 0
        for story in stories:
            if self.score_story(story):
                scored += 1
        
        if verbose:
            print(f"\nScored: {scored} stories")
        
        return scored


class AnalysisEngineV4:
    """Analysis Engine v4 - Professional summaries"""
    
    def __init__(self, db: SupabaseClient):
        self.db = db
        self.research_engine = ResearchEngine()
        self.analysis_generator = ProfessionalAnalysisGenerator()
    
    def fetch_unanalyzed(self, limit: int = 10) -> List[Dict]:
        return self.db.fetch(
            'stories',
            select='id,headline,summary,country_name,category',
            filters={'or': '(xray_analysis.is.null,xray_analysis.eq."",xray_analysis_version.lt.4)'},
            order='created_at.desc',
            limit=limit
        )
    
    def analyze_story(self, story: Dict) -> bool:
        """Generate professional analysis for a story"""
        story_id = story['id']
        headline = story.get('headline', '')
        summary = story.get('summary', '')
        
        print(f"[ANALYSIS] Analyzing: {headline[:50]}...")
        
        try:
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
            return self.db.update('stories', story_id, {
                'xray_analysis': analysis,
                'xray_analysis_version': 4,
                'xray_analysis_at': datetime.now(timezone.utc).isoformat()
            })
        except Exception as e:
            print(f"  [ERROR] {e}")
            return False
    
    def run(self, limit: int = 10, verbose: bool = True) -> int:
        """Run analysis engine on unanalyzed stories"""
        if verbose:
            print("="*60)
            print("ANALYSIS ENGINE v4")
            print("="*60)
        
        stories = self.fetch_unanalyzed(limit)
        if verbose:
            print(f"\nFound {len(stories)} stories needing analysis")
        
        analyzed = 0
        for story in stories:
            if self.analyze_story(story):
                analyzed += 1
        
        if verbose:
            print(f"\nAnalyzed: {analyzed} stories")
        
        return analyzed


class XrayEngineV4:
    """Main orchestrator for Xray v4"""
    
    def __init__(self):
        self.db = SupabaseClient(SUPABASE_URL, SERVICE_KEY)
        self.truth_engine = TruthEngineV4(self.db)
        self.analysis_engine = AnalysisEngineV4(self.db)
        self.pin_calculator = PinCalculator()
    
    def run_all(self, limit: int = 20, verbose: bool = True):
        """Run all engines"""
        if verbose:
            print("\n" + "="*60)
            print("XRAY ENGINE v4 - UNIFIED")
            print(f"Time: {datetime.now().isoformat()}")
            print("="*60)
        
        results = {
            'scored': 0,
            'analyzed': 0,
            'pinned': 0
        }
        
        # Run Truth Engine
        results['scored'] = self.truth_engine.run(limit=limit, verbose=verbose)
        
        # Run Analysis Engine
        results['analyzed'] = self.analysis_engine.run(limit=limit, verbose=verbose)
        
        # Update pinned stories
        results['pinned'] = self.pin_calculator.run(top_n=3, verbose=verbose)
        
        if verbose:
            print("\n" + "="*60)
            print("RESULTS SUMMARY")
            print("="*60)
            print(f"Stories scored: {results['scored']}")
            print(f"Stories analyzed: {results['analyzed']}")
            print(f"Stories pinned: {results['pinned']}")
        
        return results
    
    def run_truth_only(self, limit: int = 20, verbose: bool = True):
        return self.truth_engine.run(limit=limit, verbose=verbose)
    
    def run_analysis_only(self, limit: int = 10, verbose: bool = True):
        return self.analysis_engine.run(limit=limit, verbose=verbose)
    
    def run_pin_only(self, verbose: bool = True):
        return self.pin_calculator.run(top_n=3, verbose=verbose)


if __name__ == '__main__':
    import argparse
    
    parser = argparse.ArgumentParser(description='Xray Engine v4')
    parser.add_argument('--truth', action='store_true', help='Run only Truth Engine')
    parser.add_argument('--research', action='store_true', help='Run only Analysis Engine')
    parser.add_argument('--pin', action='store_true', help='Run only Pin Calculator')
    parser.add_argument('--limit', type=int, default=10, help='Max stories per engine')
    parser.add_argument('--quiet', action='store_true', help='Less output')
    
    args = parser.parse_args()
    
    engine = XrayEngineV4()
    
    if args.truth:
        engine.run_truth_only(limit=args.limit, verbose=not args.quiet)
    elif args.research:
        engine.run_analysis_only(limit=args.limit, verbose=not args.quiet)
    elif args.pin:
        engine.run_pin_only(verbose=not args.quiet)
    else:
        engine.run_all(limit=args.limit, verbose=not args.quiet)
