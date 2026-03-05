#!/usr/bin/env python3
"""
XRAY BRIEFING GENERATOR - Daily Country Briefings
Generates AI-style summaries of news for each country.

Usage:
  python briefing_generator.py [--country CODE] [--date YYYY-MM-DD]
"""

import urllib.request
import json
import time
import argparse
import os
import re
from datetime import datetime, timedelta, date

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

def get_read_headers():
    return {
        'apikey': SERVICE_KEY,
        'Authorization': 'Bearer ' + SERVICE_KEY,
        'Content-Type': 'application/json'
    }

def extract_topics(stories, max_topics=5):
    """Extract main topics from a list of stories."""
    topic_words = {}
    
    # Keywords to ignore
    stop_words = {
        'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
        'of', 'with', 'by', 'from', 'is', 'are', 'was', 'were', 'be', 'been',
        'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
        'says', 'said', 'report', 'reports', 'new', 'news', 'update', 'updates',
        'breaking', 'latest', 'today', 'after', 'over', 'amid', 'as', 'it',
        'its', 'this', 'that', 'these', 'those', 'their', 'they', 'we', 'you',
        'all', 'not', 'more', 'than', 'been', 'has', 'have', 'had'
    }
    
    for story in stories:
        headline = story.get('headline', '').lower()
        headline = re.sub(r'[^\w\s]', ' ', headline)
        
        for word in headline.split():
            if len(word) > 3 and word not in stop_words:
                topic_words[word] = topic_words.get(word, 0) + 1
    
    # Sort by frequency
    sorted_topics = sorted(topic_words.items(), key=lambda x: x[1], reverse=True)
    return [t[0].capitalize() for t in sorted_topics[:max_topics]]

def generate_briefing_summary(country_name, stories):
    """Generate a summary for a country's news."""
    if not stories:
        return None
    
    # Categorize stories
    verified = [s for s in stories if s.get('status') == 'verified']
    unverified = [s for s in stories if s.get('status') != 'verified']
    breaking = [s for s in stories if s.get('is_breaking')]
    
    # Get top story by score
    scored_stories = sorted(
        stories, 
        key=lambda s: s.get('xray_score', 0) or s.get('confidence_score', 0),
        reverse=True
    )
    top_story = scored_stories[0] if scored_stories else None
    
    # Extract topics
    topics = extract_topics(stories)
    
    # Get category breakdown
    categories = {}
    for s in stories:
        cat = s.get('category', 'General')
        categories[cat] = categories.get(cat, 0) + 1
    
    top_category = max(categories.items(), key=lambda x: x[1])[0] if categories else 'General'
    
    # Calculate average confidence
    scores = [s.get('xray_score', 0) or s.get('confidence_score', 0) for s in stories]
    avg_score = sum(scores) / len(scores) if scores else 0
    
    # Build summary
    summary_parts = []
    
    # Opening
    summary_parts.append(f"Today in {country_name}: {len(stories)} {'story' if len(stories) == 1 else 'stories'} tracked.")
    
    # Top story
    if top_story:
        top_score = top_story.get('xray_score', 0) or top_story.get('confidence_score', 0)
        summary_parts.append(f"\nTOP STORY: {top_story['headline'][:80]}{'...' if len(top_story['headline']) > 80 else ''}")
        summary_parts.append(f"Confidence: {top_score}%")
    
    # Status breakdown
    summary_parts.append(f"\nVERIFICATION STATUS: {len(verified)} verified, {len(unverified)} pending verification.")
    
    # Topics
    if topics:
        summary_parts.append(f"KEY TOPICS: {', '.join(topics[:3])}.")
    
    # Category
    summary_parts.append(f"PRIMARY CATEGORY: {top_category}.")
    
    # Breaking news
    if breaking:
        summary_parts.append(f"\n⚠️ BREAKING: {len(breaking)} breaking {'story' if len(breaking) == 1 else 'stories'} developing.")
    
    # Confidence summary
    if avg_score >= 65:
        summary_parts.append("\nOverall: High confidence in reporting.")
    elif avg_score >= 50:
        summary_parts.append("\nOverall: Moderate confidence. Some stories require verification.")
    else:
        summary_parts.append("\nOverall: Mixed confidence. Verify key details.")
    
    return '\n'.join(summary_parts)

def fetch_stories_for_country(country_code, target_date):
    """Fetch all stories for a country on a specific date."""
    # Date range for the target date (00:00:00 to 23:59:59)
    start_time = f"{target_date}T00:00:00"
    end_time = f"{target_date}T23:59:59"
    
    url = f"{SUPABASE_URL}/rest/v1/stories?select=id,headline,summary,country_code,country_name,category,status,xray_score,confidence_score,is_breaking,created_at&country_code=eq.{country_code}&created_at=gte.{start_time}&created_at=lte.{end_time}&order=created_at.desc"
    req = urllib.request.Request(url, headers=get_read_headers())
    
    try:
        with urllib.request.urlopen(req, timeout=30) as response:
            return json.loads(response.read().decode())
    except Exception as e:
        print(f"Error fetching stories for {country_code}: {e}")
        return []

def fetch_countries_with_stories(target_date):
    """Get list of countries that have stories on target date."""
    start_time = f"{target_date}T00:00:00"
    end_time = f"{target_date}T23:59:59"
    
    url = f"{SUPABASE_URL}/rest/v1/stories?select=country_code,country_name&created_at=gte.{start_time}&created_at=lte.{end_time}&country_code=not.is.null"
    req = urllib.request.Request(url, headers=get_read_headers())
    
    try:
        with urllib.request.urlopen(req, timeout=30) as response:
            stories = json.loads(response.read().decode())
            
            # Get unique countries with story counts
            country_counts = {}
            for s in stories:
                code = s.get('country_code')
                name = s.get('country_name', code)
                if code:
                    if code not in country_counts:
                        country_counts[code] = {'name': name, 'count': 0}
                    country_counts[code]['count'] += 1
            
            # Sort by count descending
            return sorted(country_counts.items(), key=lambda x: x[1]['count'], reverse=True)
    except Exception as e:
        print(f"Error fetching countries: {e}")
        return []

def check_briefing_exists(country_code, target_date):
    """Check if briefing already exists for this country and date."""
    url = f"{SUPABASE_URL}/rest/v1/country_briefings?select=id&country_code=eq.{country_code}&briefing_date=eq.{target_date}"
    req = urllib.request.Request(url, headers=get_read_headers())
    
    try:
        with urllib.request.urlopen(req, timeout=10) as response:
            data = json.loads(response.read().decode())
            return len(data) > 0
    except:
        return False

def get_top_story_id(stories):
    """Get the ID of the top story by score."""
    if not stories:
        return None
    
    scored_stories = sorted(
        stories, 
        key=lambda s: s.get('xray_score', 0) or s.get('confidence_score', 0),
        reverse=True
    )
    return scored_stories[0].get('id')

def insert_briefing(country_code, country_name, target_date, summary, story_count, top_story_id):
    """Insert a new briefing into the database."""
    briefing_data = json.dumps({
        'country_code': country_code,
        'country_name': country_name,
        'briefing_date': target_date,
        'summary': summary,
        'story_count': story_count,
        'top_story_id': top_story_id,
        'created_at': datetime.now().isoformat()
    }).encode()
    
    url = f"{SUPABASE_URL}/rest/v1/country_briefings"
    req = urllib.request.Request(url, data=briefing_data, headers=get_headers(), method='POST')
    
    try:
        with urllib.request.urlopen(req, timeout=10):
            return True
    except Exception as e:
        print(f"Error inserting briefing for {country_code}: {e}")
        return False

def update_briefing(country_code, target_date, summary, story_count, top_story_id):
    """Update an existing briefing."""
    briefing_data = json.dumps({
        'summary': summary,
        'story_count': story_count,
        'top_story_id': top_story_id,
        'created_at': datetime.now().isoformat()
    }).encode()
    
    url = f"{SUPABASE_URL}/rest/v1/country_briefings?country_code=eq.{country_code}&briefing_date=eq.{target_date}"
    req = urllib.request.Request(url, data=briefing_data, headers=get_headers(), method='PATCH')
    
    try:
        with urllib.request.urlopen(req, timeout=10):
            return True
    except Exception as e:
        print(f"Error updating briefing for {country_code}: {e}")
        return False

def run_briefing_generator(target_country=None, target_date=None):
    """Generate briefings for all countries with stories on target date."""
    if target_date is None:
        target_date = date.today().isoformat()
    
    print("=" * 60)
    print("XRAY BRIEFING GENERATOR")
    print(f"Date: {target_date}")
    print(f"Started: {datetime.now().isoformat()}")
    print("=" * 60)
    
    # Get countries with stories
    if target_country:
        # Single country mode
        countries = [(target_country, {'name': target_country, 'count': 0})]
    else:
        countries = fetch_countries_with_stories(target_date)
    
    if not countries:
        print("\nNo countries with stories found for today.")
        return {'generated': 0, 'updated': 0, 'errors': 0}
    
    print(f"\nCountries to process: {len(countries)}")
    
    generated = 0
    updated = 0
    errors = 0
    
    for country_code, info in countries:
        country_name = info['name']
        
        print(f"\n[{country_code}] {country_name}...")
        
        # Fetch stories for this country
        stories = fetch_stories_for_country(country_code, target_date)
        
        if not stories:
            print(f"  No stories found, skipping.")
            continue
        
        print(f"  Found {len(stories)} stories.")
        
        # Generate summary
        summary = generate_briefing_summary(country_name, stories)
        
        if not summary:
            print(f"  Could not generate summary, skipping.")
            continue
        
        # Get top story ID
        top_story_id = get_top_story_id(stories)
        
        # Check if briefing exists
        exists = check_briefing_exists(country_code, target_date)
        
        if exists:
            # Update existing briefing
            if update_briefing(country_code, target_date, summary, len(stories), top_story_id):
                updated += 1
                print(f"  Updated briefing.")
            else:
                errors += 1
        else:
            # Insert new briefing
            if insert_briefing(country_code, country_name, target_date, summary, len(stories), top_story_id):
                generated += 1
                print(f"  Created briefing.")
            else:
                errors += 1
        
        time.sleep(0.1)  # Rate limiting
    
    print("\n" + "=" * 60)
    print("RESULTS")
    print("=" * 60)
    print(f"Generated: {generated}")
    print(f"Updated:   {updated}")
    print(f"Errors:    {errors}")
    print(f"Finished:  {datetime.now().isoformat()}")
    
    return {
        'generated': generated,
        'updated': updated,
        'errors': errors
    }

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Xray Briefing Generator')
    parser.add_argument('--country', type=str, default=None, help='Single country code to process')
    parser.add_argument('--date', type=str, default=None, help='Target date (YYYY-MM-DD)')
    args = parser.parse_args()
    run_briefing_generator(args.country, args.date)
