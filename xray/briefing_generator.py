#!/usr/bin/env python3
"""
XRAY BRIEFING GENERATOR - Professional Country Intelligence Briefings
Generates journalist-quality summaries of news for each country.

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
from collections import Counter, defaultdict

# Configuration
SUPABASE_URL = os.environ.get('SUPABASE_URL', 'https://dkxydhuojaspmbpjfyoz.supabase.co')
SERVICE_KEY = os.environ.get('SERVICE_ROLE_SUPABASE', '') or os.environ.get('SUPABASE_SERVICE_KEY', '')

# ============================================================================
# THEME CLASSIFICATION SYSTEM
# ============================================================================

THEME_PATTERNS = {
    'Military/Security': [
        r'\b(missile|airstrike|bombing|attack|strike|offensive|invasion|troops|military|army|navy|air force|soldier|combat|warfare|weapon|drone|artillery|tank|fighter|jet|helicopter|naval|submarine|carrier|battalion|regiment|brigade|platoon|garrison|base|fort|casern)\b',
        r'\b(escalat|intensif|bombard|shell|fire|shot|blast|explosi|casualt|killed|wounded|death toll|fatalities|victim)\b',
        r'\b(nuclear|atomic|missile defense|air defense|intercept|radar|surveillance|reconnaissance)\b',
        r'\b(terrorist|insurgency|militant|rebel|gunman|extremist|radical|jihad)\b'
    ],
    'Economic/Trade': [
        r'\b(economy|economic|trade|market|stock|oil|gas|energy|price|inflation|currency|gdp|export|import|tariff|sanction|embargo)\b',
        r'\b(bank|financial|investment|revenue|budget|debt|loan|fund|capital|asset|crash|recession|growth)\b',
        r'\b(hormuz|strait|shipping|port|cargo|vessel|tanker|supply chain|commodity)\b',
        r'\b(opec|petroleum|crude|barrel|pipeline|refinery|rig)\b'
    ],
    'Political/Diplomatic': [
        r'\b(president|minister|leader|chancellor|prime minister|government|regime|administration|cabinet|ministry|parliament|congress|senate|legislature)\b',
        r'\b(election|vote|poll|campaign|referendum|ballot|candidate|opposition|party)\b',
        r'\b(diplomat|ambassador|treaty|agreement|accord|pact|negotiation|talks|summit|meeting|delegation|envoy)\b',
        r'\b(sanction|condemn|denounce|protest|demonstration|rally|unrest|dissident|crackdown|censor)\b',
        r'\b(supreme leader|ayatollah|cleric|mullah|theocrat|islamic republic)\b'
    ],
    'Humanitarian/Social': [
        r'\b(civilian|refugee|displaced|evacuee|asylum|immigrant|migrant|border|crossing|camp|shelter)\b',
        r'\b(hospital|medical|aid|relief|humanitarian|rescue|emergency|crisis|disaster|tragedy)\b',
        r'\b(casualty|death|injured|wounded|victim|survivor|missing|trapped|evacuated)\b',
        r'\b(school|church|mosque|temple|residential|neighborhood|housing|apartment|home)\b',
        r'\b(children|women|elderly|family|civilian)\b'
    ],
    'Infrastructure/Technology': [
        r'\b(power|electricity|grid|water|infrastructure|bridge|road|highway|rail|airport|telecom|internet|cyber|hack)\b',
        r'\b(nuclear facility|reactor|enrichment|uranium|centrifuge|power plant|dam|reservoir)\b'
    ],
    'Legal/Judicial': [
        r'\b(court|tribunal|judge|trial|verdict|sentence|appeal|lawsuit|prosecutor|indict|arrest|detain|prison|jail)\b',
        r'\b(investigation|probe|inquiry|hearing|testimony|evidence|witness)\b'
    ]
}

# Entities patterns for extraction
ENTITY_PATTERNS = {
    'people': [
        # Generic title + name patterns
        r'(?:President|Minister|Leader|Chancellor|Secretary|General|Admiral|Commander|Ambassador| envoy|Ayatollah|Supreme Leader)\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*',
        # Known leaders (add more as needed)
        r'\b(Khamenei|Rouhani|Raisi|Erdogan|Putin|Biden|Netanyahu|Gantz|Gallant|Smotrich|Ben-Gvir|Zelenskyy|Assad|Kim Jong Un|Xi Jinping|Mohammed bin Salman|MBS)\b',
        r'\b(Mojtaba|Masoud|Pezeshkian|Haniyeh|Nasrallah|Sinwar|Deif|Marzouk)\b'
    ],
    'places': [
        r'\b(Tehran|Jerusalem|Tel Aviv|Haifa|Beirut|Damascus|Baghdad|Gaza|West Bank|Khan Younis|Rafah|Kyiv|Moscow|Washington|Beijing|Riyadh|Ankara|Istanbul)\b',
        r'\b(Natanz|Fordow|Bushehr|Arak|Isfahan|Bandar|Abadan|Chabahar)\b',
        r'\b(Strait of Hormuz|Persian Gulf|Red Sea|Mediterranean|Golan Heights|Lebanon border)\b',
        r'\b(White House|Pentagon|Kremlin|Knesset|Parliament|Supreme Court)\b'
    ],
    'organizations': [
        r'\b(IDF|Israeli Defense Forces|Iranian Revolutionary Guard|IRGC|Quds Force|Hezbollah|Hamas|Islamic Jihad|Houthis|Ansar Allah)\b',
        r'\b(UN|United Nations|UNSC|Security Council|NATO|EU|European Union|Arab League|OPEC|IAEA)\b',
        r'\b(CIA|MI6|Mossad|FBI|NSA|Homeland Security)\b',
        r'\b(Red Cross|WHO|UNICEF|UNRWA)\b'
    ]
}

# Stop words for topic extraction
STOP_WORDS = {
    'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
    'of', 'with', 'by', 'from', 'is', 'are', 'was', 'were', 'be', 'been',
    'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
    'says', 'said', 'report', 'reports', 'new', 'news', 'update', 'updates',
    'breaking', 'latest', 'today', 'after', 'over', 'amid', 'as', 'it',
    'its', 'this', 'that', 'these', 'those', 'their', 'they', 'we', 'you',
    'all', 'not', 'more', 'than', 'been', 'has', 'have', 'had', 'could',
    'should', 'may', 'might', 'must', 'shall', 'can', 'about', 'into',
    'through', 'during', 'before', 'after', 'above', 'below', 'between',
    'under', 'again', 'further', 'then', 'once', 'here', 'there', 'when',
    'where', 'why', 'how', 'both', 'each', 'few', 'some', 'such', 'own',
    'same', 'so', 'just', 'now', 'also', 'only', 'very', 'just', 'still'
}

# Action/intensity verbs for narrative detection
ACTION_VERBS = {
    'attacks': ['strike', 'bomb', 'attack', 'fire', 'launch', 'hit', 'destroy', 'kill', 'shoot', 'assault', 'raid'],
    'defends': ['intercept', 'defend', 'repel', 'block', 'stop', 'prevent', 'protect', 'shield'],
    'escalates': ['escalate', 'intensify', 'expand', 'widen', 'deepen', 'increase', 'spread'],
    'announces': ['announce', 'declare', 'confirm', 'reveal', 'state', 'say', 'report'],
    'responds': ['respond', 'retaliate', 'counter', 'react', 'answer', 'reply'],
    'warns': ['warn', 'threaten', 'caution', 'alert', 'advise']
}

# ============================================================================
# ANALYSIS FUNCTIONS
# ============================================================================

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

def classify_theme(text):
    """Classify text into thematic categories."""
    text_lower = text.lower()
    scores = {}
    
    for theme, patterns in THEME_PATTERNS.items():
        score = 0
        for pattern in patterns:
            matches = len(re.findall(pattern, text_lower, re.IGNORECASE))
            score += matches
        if score > 0:
            scores[theme] = score
    
    # Return top themes sorted by score
    if not scores:
        return ['General']
    
    sorted_themes = sorted(scores.items(), key=lambda x: x[1], reverse=True)
    return [t[0] for t in sorted_themes[:3]]

def extract_entities(text):
    """Extract named entities (people, places, organizations) from text."""
    entities = {'people': set(), 'places': set(), 'organizations': set()}
    
    for entity_type, patterns in ENTITY_PATTERNS.items():
        for pattern in patterns:
            matches = re.findall(pattern, text, re.IGNORECASE)
            for match in matches:
                # Clean and normalize
                if isinstance(match, tuple):
                    match = match[0]
                entity = match.strip().title()
                if entity and len(entity) > 2:
                    entities[entity_type].add(entity)
    
    # Convert sets to sorted lists
    return {
        'people': sorted(list(entities['people']))[:5],
        'places': sorted(list(entities['places']))[:5],
        'organizations': sorted(list(entities['organizations']))[:5]
    }

def extract_key_phrases(headlines, max_phrases=10):
    """Extract meaningful key phrases from headlines."""
    phrase_counts = Counter()
    
    # Common phrase patterns to look for
    phrase_patterns = [
        r'(?:missile|air)?strike[s]?(?:\s+on)?',
        r'air\s+defense',
        r'(?:nuclear|atomic)\s+(?:facility|site|program)',
        r'(?:oil|energy|crude)\s+(?:price|market)',
        r'strait\s+of\s+hormuz',
        r'supreme\s+leader',
        r'(?:civilian|military)\s+(?:casualties?|deaths?)',
        r'(?:peace|ceasefire|truce)\s+(?:talks?|negotiations?)',
        r'(?:economic|trade)\s+(?:sanctions?|restrictions?)'
    ]
    
    for headline in headlines:
        headline_lower = headline.lower()
        
        # Extract phrases using patterns
        for pattern in phrase_patterns:
            matches = re.findall(pattern, headline_lower)
            for match in matches:
                if isinstance(match, tuple):
                    match = match[0] if match[0] else match[1]
                phrase_counts[match] += 1
    
    # Also extract meaningful word sequences
    for headline in headlines:
        words = re.findall(r'\b[a-z]{4,}\b', headline.lower())
        words = [w for w in words if w not in STOP_WORDS]
        
        # Count bigrams
        for i in range(len(words) - 1):
            bigram = f"{words[i]} {words[i+1]}"
            phrase_counts[bigram] += 0.5  # Lower weight for bigrams
    
    return [p[0].title() for p in phrase_counts.most_common(max_phrases)]

def detect_main_narrative(stories):
    """Detect the main narrative arc from the stories."""
    if not stories:
        return "No significant developments", []
    
    # Score stories by importance
    scored_stories = []
    for s in stories:
        score = s.get('xray_score', 0) or s.get('confidence_score', 0) or 50
        breaking_bonus = 20 if s.get('is_breaking') else 0
        headline = s.get('headline', '')
        
        # Boost for action verbs
        action_bonus = 0
        for action_type, verbs in ACTION_VERBS.items():
            if any(v in headline.lower() for v in verbs):
                action_bonus = 10
                break
        
        total_score = score + breaking_bonus + action_bonus
        scored_stories.append((total_score, headline, s))
    
    # Sort by score
    scored_stories.sort(key=lambda x: x[0], reverse=True)
    
    # Group stories by theme
    theme_groups = defaultdict(list)
    for score, headline, story in scored_stories:
        themes = classify_theme(headline)
        primary_theme = themes[0]
        theme_groups[primary_theme].append((score, headline, story))
    
    # Find dominant theme
    dominant_theme = max(theme_groups.items(), key=lambda x: sum(s[0] for s in x[1]))[0]
    
    # Extract key developments from top stories
    key_developments = []
    seen_keywords = set()
    
    for score, headline, story in scored_stories[:10]:
        # Avoid duplicate coverage
        headline_words = set(w.lower() for w in re.findall(r'\b[a-z]{4,}\b', headline))
        overlap = len(headline_words & seen_keywords) / max(len(headline_words), 1)
        
        if overlap < 0.5:  # Less than 50% word overlap
            key_developments.append(headline)
            seen_keywords.update(headline_words)
        
        if len(key_developments) >= 5:
            break
    
    return dominant_theme, key_developments

def generate_headline(country_name, stories, dominant_theme):
    """Generate a compelling one-line headline for the briefing."""
    if not stories:
        return f"{country_name.upper()} — No Significant Developments"
    
    # Find the most impactful story
    top_story = max(stories, key=lambda s: (s.get('xray_score', 0) or s.get('confidence_score', 0) or 50) + (20 if s.get('is_breaking') else 0))
    top_headline = top_story.get('headline', '')
    
    # Extract key action/event
    action_words = []
    for action_type, verbs in ACTION_VERBS.items():
        for verb in verbs:
            if verb in top_headline.lower():
                action_words.append(action_type)
                break
    
    # Try to extract the core event
    # Look for patterns like "X attacks Y" or "Z announces W"
    
    # Simplify headline to core narrative
    simplified = top_headline
    
    # Remove common filler
    fillers = [
        r'^Breaking:\s*',
        r'^Update:\s*',
        r'^Report:\s*',
        r'^Sources?:\s*',
        r',\s*sources say.*$',
        r',\s*according to.*$',
        r'\s*-\s*[A-Z][a-z]+$'  # Remove trailing source names
    ]
    for filler in fillers:
        simplified = re.sub(filler, '', simplified, flags=re.IGNORECASE)
    
    simplified = simplified.strip()
    
    # If simplified is too long, truncate intelligently
    if len(simplified) > 70:
        # Find a good break point
        simplified = simplified[:67].rsplit(' ', 1)[0] + '...'
    
    return f"{country_name.upper()} — {simplified}"

def generate_situation_paragraph(country_name, stories, dominant_theme, key_developments):
    """Generate a 2-3 sentence situation paragraph."""
    if not stories:
        return f"No significant news coverage for {country_name} today."
    
    # Count stories by verification status
    verified = sum(1 for s in stories if s.get('status') == 'verified')
    breaking = sum(1 for s in stories if s.get('is_breaking'))
    
    # Extract entities
    all_headlines = ' '.join([s.get('headline', '') for s in stories])
    entities = extract_entities(all_headlines)
    
    # Build narrative
    sentences = []
    
    # Sentence 1: Main narrative
    if key_developments:
        main_event = key_developments[0]
        # Simplify for narrative
        main_event = re.sub(r'\s*\([^)]*\)', '', main_event)  # Remove parentheticals
        sentences.append(main_event)
    
    # Sentence 2: Context/escalation
    context_parts = []
    if len(key_developments) > 1:
        # Look for secondary themes
        secondary = key_developments[1:3]
        if secondary:
            # Combine related events
            if dominant_theme == 'Military/Security':
                context_parts.append("military operations continue")
            elif dominant_theme == 'Economic/Trade':
                context_parts.append("economic developments unfolding")
            elif dominant_theme == 'Political/Diplomatic':
                context_parts.append("political situation evolving")
            
            if breaking > 1:
                context_parts.append(f"{breaking} breaking stories developing")
    
    if context_parts:
        sentences.append(" and ".join(context_parts) + ".")
    elif len(sentences) == 1:
        # Add verification context
        if verified > len(stories) * 0.7:
            sentences.append("Multiple sources confirm these developments.")
        else:
            sentences.append("Some reports remain unverified.")
    
    # Sentence 3: Impact/scope
    if entities['places']:
        places = entities['places'][:2]
        sentences.append(f"Key locations: {', '.join(places)}.")
    elif entities['organizations']:
        orgs = entities['organizations'][:2]
        sentences.append(f"Involved: {', '.join(orgs)}.")
    
    return ' '.join(sentences)

def generate_watch_list(stories, themes, entities):
    """Generate items to watch for going forward."""
    watch_items = []
    
    all_headlines = ' '.join([s.get('headline', '') for s in stories]).lower()
    
    # Pattern-based watch items
    watch_patterns = {
        'Civilian casualty reports': r'\b(civilian|casualty|death toll|killed|injured|victim)\b',
        'Oil price movements': r'\b(oil|gas|petroleum|energy|price|barrel|market)\b',
        'Nuclear site status': r'\b(nuclear|enrichment|uranium|centrifuge|reactor|facility)\b',
        'Diplomatic developments': r'\b(talks|negotiation|summit|meeting|envoy|diplomat|agreement)\b',
        'Military escalation': r'\b(escalat|intensif|expand|widen|more troops|reinforcement)\b',
        'Leadership changes': r'\b(resign|step down|appoint|succeed|successor|new leader)\b',
        'Sanctions impact': r'\b(sanction|restrict|embargo|penalty|ban)\b',
        'Humanitarian situation': r'\b(humanitarian|aid|refugee|displaced|crisis|relief)\b'
    }
    
    for item, pattern in watch_patterns.items():
        if re.search(pattern, all_headlines):
            watch_items.append(item)
    
    # Add entity-based watch items
    if entities['people']:
        person = entities['people'][0]
        watch_items.append(f"{person} statements/actions")
    
    # Limit to 3-4 items
    return watch_items[:4]

def generate_briefing_summary(country_name, stories):
    """Generate a professional intelligence briefing for a country."""
    if not stories:
        return None
    
    # Analyze stories
    dominant_theme, key_developments = detect_main_narrative(stories)
    
    # Extract all entities
    all_headlines = ' '.join([s.get('headline', '') for s in stories])
    entities = extract_entities(all_headlines)
    
    # Classify all stories by theme
    theme_counts = Counter()
    for story in stories:
        themes = classify_theme(story.get('headline', ''))
        for theme in themes:
            theme_counts[theme] += 1
    
    dominant_themes = [t[0] for t in theme_counts.most_common(3)]
    
    # Generate components
    headline = generate_headline(country_name, stories, dominant_theme)
    situation = generate_situation_paragraph(country_name, stories, dominant_theme, key_developments)
    watch_list = generate_watch_list(stories, dominant_themes, entities)
    
    # Build the briefing
    briefing_parts = []
    
    # HEADLINE
    briefing_parts.append(f"📰 {headline}")
    briefing_parts.append("")
    
    # SITUATION
    briefing_parts.append(situation)
    briefing_parts.append("")
    
    # KEY DEVELOPMENTS
    if key_developments:
        briefing_parts.append("KEY DEVELOPMENTS:")
        for dev in key_developments[:5]:
            # Clean up the development text
            dev = dev.strip()
            if not dev.endswith('.') and not dev.endswith('!') and not dev.endswith('?'):
                dev += '.'
            briefing_parts.append(f"• {dev}")
        briefing_parts.append("")
    
    # DOMINANT THEMES
    if dominant_themes:
        briefing_parts.append(f"DOMINANT THEMES: {', '.join(dominant_themes)}")
    
    # WATCH FOR
    if watch_list:
        briefing_parts.append(f"\nWATCH FOR: {', '.join(watch_list)}")
    
    return '\n'.join(briefing_parts)

# ============================================================================
# DATABASE FUNCTIONS
# ============================================================================

def fetch_stories_for_country(country_code, target_date):
    """Fetch all stories for a country on a specific date."""
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
            
            country_counts = {}
            for s in stories:
                code = s.get('country_code')
                name = s.get('country_name', code)
                if code:
                    if code not in country_counts:
                        country_counts[code] = {'name': name, 'count': 0}
                    country_counts[code]['count'] += 1
            
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

# ============================================================================
# MAIN EXECUTION
# ============================================================================

def run_briefing_generator(target_country=None, target_date=None):
    """Generate briefings for all countries with stories on target date."""
    if target_date is None:
        target_date = date.today().isoformat()
    
    print("=" * 60)
    print("XRAY BRIEFING GENERATOR v2.0 - Professional Intelligence")
    print(f"Date: {target_date}")
    print(f"Started: {datetime.now().isoformat()}")
    print("=" * 60)
    
    # Get countries with stories
    if target_country:
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
        
        # Generate professional summary
        summary = generate_briefing_summary(country_name, stories)
        
        if not summary:
            print(f"  Could not generate summary, skipping.")
            continue
        
        # Get top story ID
        top_story_id = get_top_story_id(stories)
        
        # Check if briefing exists
        exists = check_briefing_exists(country_code, target_date)
        
        if exists:
            if update_briefing(country_code, target_date, summary, len(stories), top_story_id):
                updated += 1
                print(f"  Updated briefing.")
            else:
                errors += 1
        else:
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
    parser = argparse.ArgumentParser(description='Xray Briefing Generator v2.0')
    parser.add_argument('--country', type=str, default=None, help='Single country code to process')
    parser.add_argument('--date', type=str, default=None, help='Target date (YYYY-MM-DD)')
    args = parser.parse_args()
    run_briefing_generator(args.country, args.date)
