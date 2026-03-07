#!/usr/bin/env python3
"""
Pinned Stories Calculator
Calculates pin scores and auto-pins top stories
"""

import os
import sys
import requests
from datetime import datetime, timezone, timedelta
from typing import List, Dict

# Load environment
SUPABASE_URL = os.environ.get('SUPABASE_URL', 'https://dkxydhuojaspmbpjfyoz.supabase.co')

def get_service_key():
    key = os.environ.get('SERVICE_ROLE_SUBABASE', '')
    if not key:
        with open('/a0/usr/.env') as f:
            for line in f:
                if line.startswith('SERVICE_ROLE_SUBABASE='):
                    return line.split('=', 1)[1].strip()
    return key

SERVICE_KEY = get_service_key()

class PinCalculator:
    """Calculate pin scores for stories"""
    
    def __init__(self):
        self.headers = {
            'apikey': SERVICE_KEY,
            'Authorization': f'Bearer {SERVICE_KEY}',
            'Content-Type': 'application/json',
            'Prefer': 'return=representation'
        }
    
    def calculate_pin_score(self, story: Dict) -> int:
        """Calculate pin score for a story"""
        score = 0
        
        # Breaking news in category (+30)
        if story.get('category') in ['War & Conflict', 'Politics', 'Elections']:
            score += 30
        
        # High xray score (+20)
        xray_score = story.get('xray_score', 0) or 0
        if xray_score >= 80:
            score += 20
        elif xray_score >= 60:
            score += 10
        
        # Verified status (+15)
        if story.get('status') == 'verified':
            score += 15
        
        # Recency bonus (+10 for <6h, +5 for <12h)
        created = story.get('created_at', '')
        if created:
            try:
                ct = datetime.fromisoformat(created.replace('Z', '+00:00'))
                age = datetime.now(timezone.utc) - ct
                if age < timedelta(hours=6):
                    score += 10
                elif age < timedelta(hours=12):
                    score += 5
            except:
                pass
        
        # Source tier (high priority countries get bonus)
        high_priority = ['IR', 'IL', 'UA', 'RU', 'US', 'CN']
        if story.get('country_code') in high_priority:
            score += 10
        
        return score
    
    def get_candidate_stories(self, hours: int = 24) -> List[Dict]:
        """Get stories from last N hours"""
        cutoff = (datetime.now(timezone.utc) - timedelta(hours=hours)).isoformat()
        
        resp = requests.get(
            f"{SUPABASE_URL}/rest/v1/stories",
            headers=self.headers,
            params={
                'select': 'id,headline,category,xray_score,status,country_code,country_name,created_at',
                'created_at': f'gte.{cutoff}',
                'order': 'created_at.desc',
                'limit': 100
            }
        )
        
        if resp.status_code == 200:
            return resp.json()
        return []
    
    def update_pin_status(self, story_id: str, is_pinned: bool, pin_priority: int = 0):
        """Update pin status for a story"""
        data = {
            'is_pinned': is_pinned,
            'pin_priority': pin_priority
        }
        if is_pinned:
            data['pinned_at'] = datetime.now(timezone.utc).isoformat()
        
        resp = requests.patch(
            f"{SUPABASE_URL}/rest/v1/stories?id=eq.{story_id}",
            headers=self.headers,
            json=data
        )
        return resp.status_code in [200, 204]
    
    def unpin_all(self):
        """Remove all pins"""
        resp = requests.patch(
            f"{SUPABASE_URL}/rest/v1/stories?is_pinned=eq.true",
            headers=self.headers,
            json={'is_pinned': False, 'pin_priority': 0}
        )
        return resp.status_code in [200, 204]
    
    def run(self, top_n: int = 3, verbose: bool = True):
        """Calculate and update pinned stories"""
        print("=" * 60)
        print("PINNED STORIES CALCULATOR")
        print(f"Time: {datetime.now().isoformat()}")
        print("=" * 60)
        
        # Get candidates
        stories = self.get_candidate_stories(hours=24)
        print(f"\nCandidates (last 24h): {len(stories)}")
        
        if not stories:
            print("No stories to evaluate")
            return 0
        
        # Calculate scores
        scored = []
        for story in stories:
            score = self.calculate_pin_score(story)
            story['pin_score'] = score
            if score >= 40:  # Minimum threshold
                scored.append(story)
        
        # Sort by score
        scored.sort(key=lambda x: x['pin_score'], reverse=True)
        
        print(f"\nStories with score >= 40: {len(scored)}")
        
        # Unpin all first
        self.unpin_all()
        
        # Pin top N
        pinned = []
        for i, story in enumerate(scored[:top_n]):
            priority = top_n - i  # 3, 2, 1
            if self.update_pin_status(story['id'], True, priority):
                pinned.append({
                    'headline': story['headline'][:50],
                    'score': story['pin_score'],
                    'priority': priority
                })
                if verbose:
                    print(f"\n  📌 PIN #{priority}: {story['headline'][:50]}...")
                    print(f"     Score: {story['pin_score']} | Country: {story.get('country_name', 'N/A')}")
        
        print(f"\n" + "=" * 60)
        print(f"PINNED: {len(pinned)} stories")
        print("=" * 60)
        
        return len(pinned)


if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument('--top', type=int, default=3, help='Number of stories to pin')
    parser.add_argument('--quiet', action='store_true', help='Less output')
    args = parser.parse_args()
    
    calc = PinCalculator()
    calc.run(top_n=args.top, verbose=not args.quiet)
