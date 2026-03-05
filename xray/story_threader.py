#!/usr/bin/env python3
"""
XRAY STORY THREADER - Links related stories together
Groups stories by country + headline similarity into threads.

Usage:
  python story_threader.py [--batch-size N] [--max-stories N]
"""

import urllib.request
import json
import time
import argparse
import os
import re
from datetime import datetime, timedelta
import hashlib

# Configuration
SUPABASE_URL = os.environ.get('SUPABASE_URL', 'https://dkxydhuojaspmbpjfyoz.supabase.co')
SERVICE_KEY = os.environ.get('SUPABASE_SERVICE_KEY', os.environ.get('SERVICE_ROLE_SUBABASE', os.environ.get('SUPABASE_ANON_KEY', 'sb_publishable_ydepQXbHFjFA-_TIwOYNHg_SwN0m5PL')))

def get_headers():
    return {
        'apikey': SERVICE_KEY,
        'Authorization': 'Bearer ' + SERVICE_KEY,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
    }

def extract_keywords(text, max_keywords=5):
    """Extract significant keywords from headline text."""
    if not text:
        return []
    
    # Normalize text
    text = text.lower()
    text = re.sub(r'[^\w\s]', ' ', text)
    
    # Stop words to ignore
    stop_words = {
        'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
        'of', 'with', 'by', 'from', 'is', 'are', 'was', 'were', 'be', 'been',
        'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
        'could', 'should', 'may', 'might', 'must', 'shall', 'can', 'as', 'it',
        'its', 'this', 'that', 'these', 'those', 'he', 'she', 'they', 'we',
        'you', 'i', 'me', 'him', 'her', 'us', 'them', 'my', 'your', 'his',
        'her', 'their', 'our', 'says', 'said', 'report', 'reports', 'new',
        'news', 'update', 'updates', 'breaking', 'latest', 'today', 'after'
    }
    
    # Split and filter
    words = [w for w in text.split() if len(w) > 2 and w not in stop_words]
    
    # Count frequency
    word_count = {}
    for w in words:
        word_count[w] = word_count.get(w, 0) + 1
    
    # Sort by frequency and return top keywords
    sorted_words = sorted(word_count.items(), key=lambda x: x[1], reverse=True)
    return [w[0] for w in sorted_words[:max_keywords]]

def calculate_similarity(keywords1, keywords2):
    """Calculate Jaccard similarity between two keyword sets."""
    if not keywords1 or not keywords2:
        return 0.0
    
    set1 = set(keywords1)
    set2 = set(keywords2)
    
    intersection = len(set1 & set2)
    union = len(set1 | set2)
    
    if union == 0:
        return 0.0
    
    return intersection / union

def generate_thread_id(country_code, timestamp):
    """Generate unique thread ID."""
    hash_input = f"{country_code}_{timestamp}_{time.time()}"
    hash_val = hashlib.md5(hash_input.encode()).hexdigest()[:8]
    return f"thread_{country_code.lower()}_{int(timestamp)}_{hash_val}"

def fetch_stories_without_threads(limit=100):
    """Fetch stories that don't have a thread_id assigned."""
    url = f"{SUPABASE_URL}/rest/v1/stories?select=id,headline,country_code,country_name,created_at,story_thread_id&story_thread_id=is.null&order=created_at.desc&limit={limit}"
    req = urllib.request.Request(url, headers=get_headers())
    
    try:
        with urllib.request.urlopen(req, timeout=30) as response:
            return json.loads(response.read().decode())
    except Exception as e:
        print(f"Error fetching stories: {e}")
        return []

def fetch_thread_stories(country_code, keywords, within_hours=72):
    """Find existing threads with similar keywords in same country."""
    cutoff_time = (datetime.now() - timedelta(hours=within_hours)).isoformat()
    
    url = f"{SUPABASE_URL}/rest/v1/stories?select=id,headline,story_thread_id,country_code&country_code=eq.{country_code}&created_at=gte.{cutoff_time}&story_thread_id=not.is.null&limit=50"
    req = urllib.request.Request(url, headers=get_headers())
    
    try:
        with urllib.request.urlopen(req, timeout=30) as response:
            stories = json.loads(response.read().decode())
            
            # Find best matching thread
            best_match = None
            best_score = 0.3  # Minimum threshold
            
            for story in stories:
                if not story.get('story_thread_id'):
                    continue
                
                story_keywords = extract_keywords(story.get('headline', ''))
                similarity = calculate_similarity(keywords, story_keywords)
                
                if similarity > best_score:
                    best_score = similarity
                    best_match = story
            
            return best_match
    except Exception as e:
        print(f"Error fetching thread stories: {e}")
        return None

def update_story_thread(story_id, thread_id):
    """Update a story with its thread_id."""
    update_data = json.dumps({
        'story_thread_id': thread_id,
        'updated_at': datetime.now().isoformat()
    }).encode()
    
    url = f"{SUPABASE_URL}/rest/v1/stories?id=eq.{story_id}"
    req = urllib.request.Request(url, data=update_data, headers=get_headers(), method='PATCH')
    
    try:
        with urllib.request.urlopen(req, timeout=10):
            return True
    except Exception as e:
        print(f"Error updating story {story_id}: {e}")
        return False

def get_thread_count(thread_id):
    """Get count of stories in a thread."""
    url = f"{SUPABASE_URL}/rest/v1/stories?select=id&story_thread_id=eq.{thread_id}"
    req = urllib.request.Request(url, headers=get_headers())
    
    try:
        with urllib.request.urlopen(req, timeout=10) as response:
            stories = json.loads(response.read().decode())
            return len(stories)
    except:
        return 0

def run_story_threader(batch_size=50, max_stories=200):
    """Run the Story Threader on unassigned stories."""
    print("=" * 60)
    print("XRAY STORY THREADER")
    print(f"Started: {datetime.now().isoformat()}")
    print("=" * 60)
    
    # Fetch stories without threads
    stories = fetch_stories_without_threads(max_stories)
    total_unassigned = len(stories)
    print(f"\nStories without threads: {total_unassigned}")
    
    if not stories:
        print("No stories to thread.")
        return {'processed': 0, 'threaded': 0, 'new_threads': 0}
    
    processed = 0
    threaded = 0
    new_threads = 0
    thread_cache = {}  # Cache keywords -> thread_id for this run
    
    for story in stories:
        story_id = story['id']
        headline = story.get('headline', '')
        country_code = story.get('country_code', 'XX')
        
        if not country_code or country_code == 'XX':
            continue
        
        # Extract keywords from headline
        keywords = extract_keywords(headline)
        
        if not keywords:
            continue
        
        # Check cache first
        cache_key = f"{country_code}_{','.join(sorted(keywords[:3]))}"
        
        if cache_key in thread_cache:
            thread_id = thread_cache[cache_key]
        else:
            # Look for existing similar thread
            match = fetch_thread_stories(country_code, keywords)
            
            if match and match.get('story_thread_id'):
                thread_id = match['story_thread_id']
            else:
                # Create new thread
                thread_id = generate_thread_id(
                    country_code,
                    datetime.now().timestamp()
                )
                new_threads += 1
            
            thread_cache[cache_key] = thread_id
        
        # Update story with thread_id
        if update_story_thread(story_id, thread_id):
            threaded += 1
            print(f"  [{country_code}] {headline[:50]}... -> {thread_id[:30]}")
        
        processed += 1
        time.sleep(0.05)  # Rate limiting
    
    print("\n" + "=" * 60)
    print("RESULTS")
    print("=" * 60)
    print(f"Processed:   {processed}")
    print(f"Threaded:    {threaded}")
    print(f"New Threads: {new_threads}")
    print(f"Finished:    {datetime.now().isoformat()}")
    
    return {
        'processed': processed,
        'threaded': threaded,
        'new_threads': new_threads
    }

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Xray Story Threader')
    parser.add_argument('--batch-size', type=int, default=50, help='Stories per batch')
    parser.add_argument('--max-stories', type=int, default=200, help='Max stories to process')
    args = parser.parse_args()
    run_story_threader(args.batch_size, args.max_stories)
