#!/usr/bin/env python3
"""
XRAY STORY THREADER v2.0 - Links related stories together
Groups stories by country + headline similarity into threads.

Enhancements in v2.0:
- Batch updates (single API call for multiple stories)
- Thread merging (>50% keyword overlap)
- Weighted keyword extraction with NER-like entity detection
- Pre-populated thread cache from database
- Retry logic with exponential backoff

Usage:
  python story_threader.py [--batch-size N] [--max-stories N]
"""

import urllib.request
import urllib.error
import json
import time
import argparse
import os
import re
from datetime import datetime, timedelta
import hashlib
import functools

# ============================================================================
# CONFIGURATION
# ============================================================================

SUPABASE_URL = os.environ.get('SUPABASE_URL', 'https://dkxydhuojaspmbpjfyoz.supabase.co')
SERVICE_KEY = os.environ.get('SERVICE_ROLE_SUPABASE', '') or os.environ.get('SUPABASE_SERVICE_KEY', ''))

# Retry configuration
MAX_RETRIES = 3
RETRY_BASE_DELAY = 1.0  # seconds
RETRY_MAX_DELAY = 10.0

# Similarity thresholds
THREAD_MATCH_THRESHOLD = 0.3  # Minimum similarity to join existing thread
THREAD_MERGE_THRESHOLD = 0.5  # Similarity to trigger thread merging

# Country-specific keyword weights (entities important for that region)
COUNTRY_KEYWORD_BOOST = {
    'IR': ['iran', 'tehran', 'irgc', 'khamenei', 'rouhani', 'iranian', 'quds', 'nuclear', 'sanctions', 'mullah'],
    'IL': ['israel', 'tel aviv', 'netanyahu', 'idf', 'gaza', 'hamas', 'west bank', 'jerusalem', 'hezbollah', 'liverpool'],
    'UA': ['ukraine', 'kyiv', 'zelensky', 'russian', 'moscow', 'putin', 'donbas', 'crimea', 'nato', 'kremlin'],
    'US': ['biden', 'trump', 'white house', 'pentagon', 'congress', 'senate', 'federal', 'american'],
    'CN': ['china', 'beijing', 'xi jinping', 'ccp', 'taiwan', 'xinjiang', 'hong kong', 'chinese'],
    'RU': ['russia', 'moscow', 'putin', 'kremlin', 'russian', 'ukraine', 'nato'],
    'KP': ['north korea', 'kim jong', 'pyongyang', 'nuclear', 'missile', 'dprk'],
    'AF': ['afghanistan', 'taliban', 'kabul', 'kandahar', 'isis', 'isis-k'],
}

# Named entity patterns (simplified NER without external dependencies)
LOCATION_PATTERNS = [
    r'\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*(?:\s+(?:City|Province|Region|State|Republic))?)\b',
    r'\b(north|south|east|west|central)\s+[a-z]+\b',
]

ORGANIZATION_PATTERNS = [
    r'\b([A-Z]{2,}(?:\s+[A-Z]{2,})*)\b',  # Acronyms like NATO, UN, WHO
    r'\b([A-Z][a-z]+\s+(?:Ministry|Government|Army|Forces|Council|Party|Group|Organization))\b',
]

PERSON_PATTERNS = [
    r'\b(President|Minister|Secretary|General|Admiral|Colonel|Senator|Governor|Director)\s+[A-Z][a-z]+\b',
    r'\b[A-Z][a-z]+\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b',  # Full names
]

# ============================================================================
# LOGGING WITH TIMESTAMPS
# ============================================================================

def log(message, level='INFO'):
    """Log message with timestamp."""
    timestamp = datetime.now().isoformat()
    print(f"[{timestamp}] [{level}] {message}")

# ============================================================================
# RETRY DECORATOR
# ============================================================================

def retry_on_failure(max_retries=MAX_RETRIES, base_delay=RETRY_BASE_DELAY):
    """Decorator to retry function on failure with exponential backoff."""
    def decorator(func):
        @functools.wraps(func)
        def wrapper(*args, **kwargs):
            last_exception = None
            for attempt in range(max_retries):
                try:
                    return func(*args, **kwargs)
                except (urllib.error.URLError, urllib.error.HTTPError, ConnectionError, TimeoutError) as e:
                    last_exception = e
                    if attempt < max_retries - 1:
                        delay = min(base_delay * (2 ** attempt), RETRY_MAX_DELAY)
                        log(f"Retry {attempt + 1}/{max_retries} for {func.__name__} after error: {e}. Waiting {delay:.1f}s", 'WARN')
                        time.sleep(delay)
            log(f"All retries exhausted for {func.__name__}: {last_exception}", 'ERROR')
            raise last_exception
        return wrapper
    return decorator

# ============================================================================
# API HELPERS
# ============================================================================

def get_headers():
    return {
        'apikey': SERVICE_KEY,
        'Authorization': 'Bearer ' + SERVICE_KEY,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
    }

@retry_on_failure()
def make_request(url, method='GET', data=None, timeout=30):
    """Make HTTP request with retry logic."""
    headers = get_headers()
    if data is not None:
        data = json.dumps(data).encode() if isinstance(data, dict) else data.encode() if isinstance(data, str) else data
    
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    with urllib.request.urlopen(req, timeout=timeout) as response:
        if method != 'PATCH':
            return json.loads(response.read().decode())
        return True

# ============================================================================
# ENHANCED KEYWORD EXTRACTION (v2.0)
# ============================================================================

def extract_entities(text):
    """Extract named entities (simplified NER without external dependencies).
    
    Returns dict with 'locations', 'organizations', 'persons'
    """
    if not text:
        return {'locations': [], 'organizations': [], 'persons': []}
    
    entities = {'locations': [], 'organizations': [], 'persons': []}
    
    # Extract potential locations
    for pattern in LOCATION_PATTERNS:
        matches = re.findall(pattern, text)
        entities['locations'].extend([m.lower() for m in matches if m])
    
    # Extract potential organizations (acronyms)
    for pattern in ORGANIZATION_PATTERNS:
        matches = re.findall(pattern, text)
        entities['organizations'].extend([m.lower() for m in matches if m and len(m) > 2])
    
    # Extract potential persons (titles + names)
    for pattern in PERSON_PATTERNS:
        matches = re.findall(pattern, text)
        entities['persons'].extend([m.lower() for m in matches if m])
    
    # Deduplicate
    for key in entities:
        entities[key] = list(set(entities[key]))
    
    return entities

def extract_keywords_enhanced(text, country_code=None, max_keywords=8):
    """Extract weighted keywords with NER-like entity detection.
    
    Weight hierarchy:
    - Country-boosted terms: weight 3.0
    - Named entities (persons, orgs, locations): weight 2.0
    - Significant nouns: weight 1.0
    - Important verbs: weight 0.5
    
    Returns list of (keyword, weight) tuples sorted by weight.
    """
    if not text:
        return []
    
    # Normalize text
    text_lower = text.lower()
    text_clean = re.sub(r'[^\w\s]', ' ', text_lower)
    
    # Stop words
    stop_words = {
        'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
        'of', 'with', 'by', 'from', 'is', 'are', 'was', 'were', 'be', 'been',
        'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
        'could', 'should', 'may', 'might', 'must', 'shall', 'can', 'as', 'it',
        'its', 'this', 'that', 'these', 'those', 'he', 'she', 'they', 'we',
        'you', 'i', 'me', 'him', 'her', 'us', 'them', 'my', 'your', 'his',
        'her', 'their', 'our', 'says', 'said', 'report', 'reports', 'new',
        'news', 'update', 'updates', 'breaking', 'latest', 'today', 'after',
        'has', 'have', 'had', 'not', 'no', 'yes', 'over', 'under', 'out', 'up',
        'down', 'off', 'into', 'more', 'most', 'some', 'any', 'all', 'each',
        'every', 'both', 'few', 'many', 'other', 'only', 'own', 'same', 'than',
        'too', 'very', 'just', 'also', 'now', 'here', 'there', 'when', 'where',
        'what', 'which', 'who', 'whom', 'whose', 'why', 'how'
    }
    
    # Important verbs (action words)
    action_verbs = {
        'attack', 'strike', 'launch', 'kill', 'arrest', 'capture', 'seize',
        'bomb', 'invade', 'defend', 'retreat', 'advance', 'withdraw', 'deploy',
        'sanction', 'ban', 'block', 'approve', 'reject', 'sign', 'veto',
        'negotiate', 'agree', 'ceasefire', 'surrender', 'destroy', 'target'
    }
    
    # Extract named entities
    entities = extract_entities(text)
    
    # Calculate word weights
    word_weights = {}
    
    # Get country-boosted terms
    country_boost = set(COUNTRY_KEYWORD_BOOST.get(country_code, []))
    
    # Split and process words
    words = [w for w in text_clean.split() if len(w) > 2 and w not in stop_words]
    
    # Count word frequency
    word_count = {}
    for w in words:
        word_count[w] = word_count.get(w, 0) + 1
    
    # Assign weights
    for word, count in word_count.items():
        weight = 1.0  # Base weight for nouns
        
        # Country-boosted terms get highest weight
        if word in country_boost:
            weight = 3.0
        # Named entities get high weight
        elif word in entities['locations'] or word in entities['organizations'] or word in entities['persons']:
            weight = 2.0
        # Check if it's part of an entity phrase
        elif any(word in phrase for phrase in entities['locations'] + entities['organizations'] + entities['persons']):
            weight = 1.5
        # Action verbs
        elif word in action_verbs:
            weight = 0.8
        # Numbers are significant
        elif word.isdigit():
            weight = 1.2
        
        # Multiply by frequency (with diminishing returns)
        word_weights[word] = weight * (1 + 0.2 * min(count - 1, 3))
    
    # Sort by weight and return top keywords
    sorted_keywords = sorted(word_weights.items(), key=lambda x: x[1], reverse=True)
    return sorted_keywords[:max_keywords]

def keywords_to_set(weighted_keywords):
    """Convert weighted keywords to simple set for similarity calculation."""
    return set(kw[0] for kw in weighted_keywords)

# ============================================================================
# SIMILARITY CALCULATIONS
# ============================================================================

def calculate_similarity(keywords1, keywords2):
    """Calculate Jaccard similarity between two keyword sets.
    
    Accepts either sets or weighted keyword lists.
    """
    if not keywords1 or not keywords2:
        return 0.0
    
    # Convert weighted lists to sets if needed
    if isinstance(keywords1, list):
        set1 = keywords_to_set(keywords1)
    else:
        set1 = set(keywords1)
    
    if isinstance(keywords2, list):
        set2 = keywords_to_set(keywords2)
    else:
        set2 = set(keywords2)
    
    intersection = len(set1 & set2)
    union = len(set1 | set2)
    
    if union == 0:
        return 0.0
    
    return intersection / union

# ============================================================================
# THREAD MANAGEMENT
# ============================================================================

def generate_thread_id(country_code, timestamp):
    """Generate unique thread ID (backward compatible format)."""
    hash_input = f"{country_code}_{timestamp}_{time.time()}"
    hash_val = hashlib.md5(hash_input.encode()).hexdigest()[:8]
    return f"thread_{country_code.lower()}_{int(timestamp)}_{hash_val}"

# ============================================================================
# DATABASE OPERATIONS
# ============================================================================

def fetch_stories_without_threads(limit=100):
    """Fetch stories that don't have a thread_id assigned."""
    url = f"{SUPABASE_URL}/rest/v1/stories?select=id,headline,country_code,country_name,created_at,story_thread_id&story_thread_id=is.null&order=created_at.desc&limit={limit}"
    try:
        return make_request(url)
    except Exception as e:
        log(f"Error fetching stories: {e}", 'ERROR')
        return []

def fetch_all_threads_with_stories(within_hours=72):
    """Pre-populate cache with all existing threads and their keywords.
    
    Returns dict: {thread_id: {'keywords': [...], 'country': str, 'story_ids': [...]}}
    """
    cutoff_time = (datetime.now() - timedelta(hours=within_hours)).isoformat()
    
    url = f"{SUPABASE_URL}/rest/v1/stories?select=id,headline,story_thread_id,country_code&created_at=gte.{cutoff_time}&story_thread_id=not.is.null&limit=200"
    
    try:
        stories = make_request(url)
        
        # Group by thread_id
        threads = {}
        for story in stories:
            thread_id = story.get('story_thread_id')
            if not thread_id:
                continue
            
            if thread_id not in threads:
                threads[thread_id] = {
                    'keywords': [],
                    'country': story.get('country_code', 'XX'),
                    'story_ids': [],
                    'headlines': []
                }
            
            threads[thread_id]['story_ids'].append(story['id'])
            threads[thread_id]['headlines'].append(story.get('headline', ''))
        
        # Extract keywords for each thread (combined from all headlines)
        for thread_id, data in threads.items():
            combined_text = ' '.join(data['headlines'])
            data['keywords'] = extract_keywords_enhanced(combined_text, data['country'])
            # Remove headlines to save memory
            del data['headlines']
        
        log(f"Pre-populated cache with {len(threads)} existing threads")
        return threads
    
    except Exception as e:
        log(f"Error fetching threads: {e}", 'ERROR')
        return {}

def update_stories_batch(updates):
    """Batch update multiple stories with thread_ids.
    
    Args:
        updates: dict mapping story_id -> thread_id
    
    Returns: (success_count, failed_ids)
    """
    if not updates:
        return 0, []
    
    # Build a single PATCH request using OR syntax
    # PATCH /stories?or=(id.eq.1,id.eq.2,id.eq.3)
    story_ids = list(updates.keys())
    or_conditions = ','.join(f'id.eq.{sid}' for sid in story_ids)
    
    # For batch update, we need to use a common thread_id or do individual updates
    # Supabase REST API doesn't support true batch updates with different values
    # So we'll use a more efficient approach: group by thread_id
    
    # Group stories by thread_id
    thread_groups = {}
    for story_id, thread_id in updates.items():
        if thread_id not in thread_groups:
            thread_groups[thread_id] = []
        thread_groups[thread_id].append(story_id)
    
    success_count = 0
    failed_ids = []
    
    # Update each group (much fewer API calls than individual updates)
    for thread_id, story_id_list in thread_groups.items():
        # Use IN clause for batch update
        or_clause = ','.join(f'id.eq.{sid}' for sid in story_id_list)
        url = f"{SUPABASE_URL}/rest/v1/stories?or=({or_clause})"
        
        update_data = {
            'story_thread_id': thread_id,
            'updated_at': datetime.now().isoformat()
        }
        
        try:
            make_request(url, method='PATCH', data=update_data, timeout=30)
            success_count += len(story_id_list)
            log(f"Batch updated {len(story_id_list)} stories to thread {thread_id[:30]}...")
        except Exception as e:
            log(f"Error in batch update for thread {thread_id}: {e}", 'ERROR')
            failed_ids.extend(story_id_list)
            # Fallback: try individual updates
            for sid in story_id_list:
                if update_story_single(sid, thread_id):
                    success_count += 1
                    failed_ids.remove(sid)
    
    return success_count, failed_ids

def update_story_single(story_id, thread_id):
    """Fallback single story update."""
    url = f"{SUPABASE_URL}/rest/v1/stories?id=eq.{story_id}"
    update_data = {
        'story_thread_id': thread_id,
        'updated_at': datetime.now().isoformat()
    }
    
    try:
        make_request(url, method='PATCH', data=update_data, timeout=10)
        return True
    except Exception as e:
        log(f"Error updating story {story_id}: {e}", 'ERROR')
        return False

def merge_threads(source_thread_id, target_thread_id, story_ids_to_move):
    """Merge source thread into target thread.
    
    Args:
        source_thread_id: Thread to merge from (will be emptied)
        target_thread_id: Thread to merge into (will remain)
        story_ids_to_move: List of story IDs to update
    """
    if not story_ids_to_move:
        return True
    
    log(f"Merging thread {source_thread_id[:30]}... into {target_thread_id[:30]}... ({len(story_ids_to_move)} stories)")
    
    # Batch update all stories to target thread
    updates = {sid: target_thread_id for sid in story_ids_to_move}
    success_count, failed = update_stories_batch(updates)
    
    return len(failed) == 0

# ============================================================================
# THREAD FINDER WITH MERGING
# ============================================================================

def find_best_thread(country_code, keywords, thread_cache):
    """Find best matching thread, potentially merging similar threads.
    
    Args:
        country_code: Country code for the story
        keywords: Weighted keyword list for the story
        thread_cache: Dict of existing threads
    
    Returns: (thread_id, threads_to_merge)
    """
    matching_threads = []
    
    for thread_id, thread_data in thread_cache.items():
        # Only consider threads from same country
        if thread_data['country'] != country_code:
            continue
        
        similarity = calculate_similarity(keywords, thread_data['keywords'])
        
        if similarity >= THREAD_MATCH_THRESHOLD:
            matching_threads.append((thread_id, similarity, thread_data))
    
    if not matching_threads:
        return None, []
    
    # Sort by similarity
    matching_threads.sort(key=lambda x: x[1], reverse=True)
    
    # Check if we should merge similar threads
    best_thread_id = matching_threads[0][0]
    threads_to_merge = []
    
    # Find threads with >50% overlap to merge
    if len(matching_threads) > 1:
        for thread_id, similarity, thread_data in matching_threads[1:]:
            if similarity >= THREAD_MERGE_THRESHOLD:
                threads_to_merge.append((thread_id, thread_data))
                log(f"Thread {thread_id[:30]}... ({similarity:.2f} similarity) marked for merge into {best_thread_id[:30]}...")
    
    return best_thread_id, threads_to_merge

# ============================================================================
# MAIN THREADER LOGIC
# ============================================================================

def run_story_threader(batch_size=50, max_stories=200):
    """Run the Story Threader on unassigned stories.
    
    v2.0 Enhanced with:
    - Batch updates
    - Thread merging
    - Weighted keyword extraction
    - Pre-populated cache
    - Retry logic
    """
    print("=" * 60)
    print("XRAY STORY THREADER v2.0")
    print(f"Started: {datetime.now().isoformat()}")
    print("=" * 60)
    
    # Pre-populate thread cache from database
    log("Pre-populating thread cache...")
    thread_cache = fetch_all_threads_with_stories()
    
    # Fetch stories without threads
    log("Fetching unassigned stories...")
    stories = fetch_stories_without_threads(max_stories)
    total_unassigned = len(stories)
    log(f"Stories without threads: {total_unassigned}")
    
    if not stories:
        log("No stories to thread.")
        return {'processed': 0, 'threaded': 0, 'new_threads': 0, 'merged': 0}
    
    processed = 0
    pending_updates = {}  # Collect batch updates: story_id -> thread_id
    new_threads = 0
    merged_threads = 0
    merge_operations = []  # Store merge operations to perform after matching
    
    for story in stories:
        story_id = story['id']
        headline = story.get('headline', '')
        country_code = story.get('country_code', 'XX')
        
        if not country_code or country_code == 'XX':
            continue
        
        # Extract weighted keywords from headline
        keywords = extract_keywords_enhanced(headline, country_code)
        
        if not keywords:
            continue
        
        # Find best matching thread (with potential merges)
        best_thread_id, threads_to_merge = find_best_thread(country_code, keywords, thread_cache)
        
        if best_thread_id:
            thread_id = best_thread_id
            
            # Queue merge operations
            for merge_thread_id, merge_data in threads_to_merge:
                merge_operations.append((merge_thread_id, thread_id, merge_data['story_ids']))
                merged_threads += 1
                # Remove merged thread from cache
                if merge_thread_id in thread_cache:
                    del thread_cache[merge_thread_id]
        else:
            # Create new thread
            thread_id = generate_thread_id(country_code, datetime.now().timestamp())
            new_threads += 1
            
            # Add new thread to cache
            thread_cache[thread_id] = {
                'keywords': keywords,
                'country': country_code,
                'story_ids': [story_id]
            }
        
        # Queue update for batch processing
        pending_updates[story_id] = thread_id
        processed += 1
    
    # Perform batch updates (single API call per thread group)
    log(f"Performing batch updates for {len(pending_updates)} stories...")
    threaded, failed = update_stories_batch(pending_updates)
    
    # Perform thread merges
    if merge_operations:
        log(f"Performing {len(merge_operations)} thread merges...")
        for source_id, target_id, story_ids in merge_operations:
            if merge_threads(source_id, target_id, story_ids):
                log(f"Merged {len(story_ids)} stories from {source_id[:25]}... to {target_id[:25]}...")
            else:
                log(f"Failed to merge {source_id[:25]}... into {target_id[:25]}...", 'WARN')
    
    # Final results
    print("\n" + "=" * 60)
    print("RESULTS")
    print("=" * 60)
    print(f"Processed:     {processed}")
    print(f"Threaded:      {threaded}")
    print(f"New Threads:   {new_threads}")
    print(f"Merged:        {merged_threads}")
    print(f"Failed:        {len(failed)}")
    print(f"API Calls:     ~{len(set(pending_updates.values()))} (batched)")
    print(f"Finished:      {datetime.now().isoformat()}")
    
    return {
        'processed': processed,
        'threaded': threaded,
        'new_threads': new_threads,
        'merged': merged_threads,
        'failed': len(failed)
    }

# ============================================================================
# ENTRY POINT
# ============================================================================

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Xray Story Threader v2.0')
    parser.add_argument('--batch-size', type=int, default=50, help='Stories per batch')
    parser.add_argument('--max-stories', type=int, default=200, help='Max stories to process')
    args = parser.parse_args()
    run_story_threader(args.batch_size, args.max_stories)
