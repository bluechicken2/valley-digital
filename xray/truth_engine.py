#!/usr/bin/env python3
"""
XRAY TRUTH ENGINE - News Verification System
Processes unverified stories and calculates confidence scores.

Usage:
  python truth_engine.py [--batch-size N] [--max-stories N]
"""

import urllib.request
import json
import time
import argparse
import os
from datetime import datetime

# Configuration
SUPABASE_URL = os.environ.get('SUPABASE_URL', 'https://dkxydhuojaspmbpjfyoz.supabase.co')
SERVICE_KEY = os.environ.get('SUPABASE_SERVICE_KEY', os.environ.get('SUPABASE_ANON_KEY', 'sb_publishable_ydepQXbHFjFA-_TIwOYNHg_SwN0m5PL'))

def get_headers():
    return {
        'apikey': SERVICE_KEY,
        'Authorization': 'Bearer ' + SERVICE_KEY,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
    }

def truth_engine_analyze(story):
    """Calculate confidence score (0-100) and verdict for a story."""
    score = 40  # Base score
    
    headline = story.get('headline', '')
    summary = story.get('summary', '')
    full_text = story.get('full_text', '') or ''
    source_count = story.get('source_count', 1)
    confidence_score = story.get('confidence_score', 40)
    
    text = (headline + ' ' + summary + ' ' + full_text).lower()
    
    # Source corroboration boost
    if source_count >= 5:
        score += 15
    elif source_count >= 3:
        score += 10
    elif source_count >= 2:
        score += 5
    
    # Trust signals - official sources, confirmed reports
    trust_keywords = ['confirmed', 'pentagon', 'official', 'announced', 'statement', 
                     'government', 'ministry', 'president', 'spokesperson', 
                     'according to officials', 'military said', 'defense ministry']
    for kw in trust_keywords:
        if kw in text:
            score += 5
    
    # Location specificity
    locations = ['tehran', 'washington', 'moscow', 'beijing', 'kyiv', 'tel aviv', 
                'london', 'paris', 'berlin', 'tokyo', 'damascus', 'gaza']
    for loc in locations:
        if loc in text:
            score += 3
    
    # Numbers and specifics
    if any(c.isdigit() for c in text):
        score += 3
    
    # Opinion/red flags
    opinion_keywords = ['analysis', 'could be', 'might be', 'may be', 'possibly', 
                       'perhaps', 'allegedly', 'reportedly', 'sources say', 
                       'unconfirmed', 'speculation', 'opinion', 'editorial']
    for kw in opinion_keywords:
        if kw in text:
            score -= 8
    
    # Breaking news bonus
    if story.get('is_breaking'):
        score += 5
    
    # Use existing confidence_score
    if confidence_score > 70:
        score += 10
    elif confidence_score > 50:
        score += 5
    
    score = max(5, min(99, score))
    
    # Determine verdict and status
    if score >= 65:
        verdict = f"Score {score}: High confidence. Multiple credibility indicators."
        status = 'verified'
    elif score >= 50:
        verdict = f"Score {score}: Moderate confidence. Verifiable details present."
        status = 'verified'
    elif score >= 35:
        verdict = f"Score {score}: Requires additional corroboration."
        status = 'unverified'
    else:
        verdict = f"Score {score}: Insufficient verification. Requires investigation."
        status = 'unverified'
    
    return score, verdict, status

def run_truth_engine(batch_size=20, max_stories=50):
    """Run the Truth Engine on pending stories."""
    print("=" * 60)
    print("XRAY TRUTH ENGINE")
    print(f"Started: {datetime.now().isoformat()}")
    print("=" * 60)
    
    # Check pending stories
    url = f"{SUPABASE_URL}/rest/v1/stories?select=id&xray_verdict=is.null"
    req = urllib.request.Request(url, headers=get_headers())
    with urllib.request.urlopen(req) as response:
        total_unverified = len(json.loads(response.read().decode()))
        print(f"\nStories pending verification: {total_unverified}")
    
    processed = 0
    updated = 0
    errors = 0
    
    for offset in range(0, min(total_unverified, max_stories), batch_size):
        url = f"{SUPABASE_URL}/rest/v1/stories?select=id,headline,summary,full_text,source_count,confidence_score,is_breaking,status&xray_verdict=is.null&order=created_at.desc&limit={batch_size}&offset={offset}"
        req = urllib.request.Request(url, headers=get_headers())
        
        try:
            with urllib.request.urlopen(req, timeout=30) as response:
                stories = json.loads(response.read().decode())
                
                for story in stories:
                    story_id = story['id']
                    score, verdict, status = truth_engine_analyze(story)
                    
                    update_data = json.dumps({
                        'xray_score': score,
                        'xray_verdict': verdict[:150],
                        'status': status,
                        'updated_at': datetime.now().isoformat()
                    }).encode()
                    
                    update_url = f"{SUPABASE_URL}/rest/v1/stories?id=eq.{story_id}"
                    update_req = urllib.request.Request(update_url, data=update_data, headers=get_headers(), method='PATCH')
                    
                    try:
                        with urllib.request.urlopen(update_req, timeout=10):
                            updated += 1
                            print(f"  [{score:2d}] {story['headline'][:60]}...")
                    except Exception as e:
                        errors += 1
                        print(f"  ERROR: {story_id}: {str(e)[:50]}")
                    
                    processed += 1
                    time.sleep(0.1)
                    
        except Exception as e:
            print(f"  BATCH ERROR: {str(e)[:100]}")
            break
    
    print("\n" + "=" * 60)
    print("RESULTS")
    print("=" * 60)
    print(f"Processed: {processed}")
    print(f"Updated:   {updated}")
    print(f"Errors:    {errors}")
    print(f"Finished:  {datetime.now().isoformat()}")
    
    return {'processed': processed, 'updated': updated, 'errors': errors}

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Xray Truth Engine')
    parser.add_argument('--batch-size', type=int, default=20, help='Stories per batch')
    parser.add_argument('--max-stories', type=int, default=50, help='Max stories to process')
    args = parser.parse_args()
    run_truth_engine(args.batch_size, args.max_stories)
