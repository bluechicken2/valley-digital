#!/usr/bin/env python3
"""
Xray Research Engine v4
Professional-grade research and verification
"""

import os
import re
import json
import requests
from datetime import datetime, timezone, timedelta
from typing import Dict, List, Optional, Tuple
from collections import defaultdict

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


class WikipediaAPI:
    """Wikipedia API for background research"""
    
    BASE_URL = "https://en.wikipedia.org/api/rest_v1"
    API_URL = "https://en.wikipedia.org/w/api.php"
    
    def search(self, query: str, limit: int = 3) -> List[Dict]:
        """Search Wikipedia for articles"""
        try:
            params = {
                'action': 'opensearch',
                'search': query,
                'limit': limit,
                'format': 'json'
            }
            resp = requests.get(self.API_URL, params=params, timeout=10)
            if resp.status_code == 200:
                data = resp.json()
                results = []
                if len(data) >= 4:
                    for i, title in enumerate(data[1]):
                        results.append({
                            'title': title,
                            'url': data[3][i] if i < len(data[3]) else '',
                            'source': 'wikipedia'
                        })
                return results
        except Exception as e:
            print(f"  [WIKI ERROR] {e}")
        return []
    
    def get_summary(self, title: str) -> Dict:
        """Get summary of a Wikipedia article"""
        try:
            # Use REST API for summary
            url = f"{self.BASE_URL}/page/summary/{title.replace(' ', '_')}"
            resp = requests.get(url, timeout=10)
            if resp.status_code == 200:
                data = resp.json()
                return {
                    'title': data.get('title', ''),
                    'extract': data.get('extract', '')[:500],
                    'url': data.get('content_urls', {}).get('desktop', {}).get('page', ''),
                    'thumbnail': data.get('thumbnail', {}).get('source', ''),
                    'source': 'wikipedia'
                }
        except Exception as e:
            print(f"  [WIKI ERROR] {e}")
        return {}
    
    def get_context_for_entity(self, entity: str, entity_type: str = 'place') -> Dict:
        """Get contextual information for an entity"""
        # Map entity types to search prefixes
        prefixes = {
            'place': '',
            'person': '',
            'org': '',
            'country': 'Politics of ',
            'conflict': ''
        }
        
        query = prefixes.get(entity_type, '') + entity
        results = self.search(query, limit=1)
        if results:
            return self.get_summary(results[0]['title'])
        return {}


class EnhancedEntityExtractor:
    """Advanced entity extraction with NLP-like features"""
    
    # Known entities database
    WORLD_LEADERS = {
        'putin': {'name': 'Vladimir Putin', 'role': 'President of Russia', 'country': 'RU'},
        'biden': {'name': 'Joe Biden', 'role': 'US President', 'country': 'US'},
        'trump': {'name': 'Donald Trump', 'role': 'US President-elect', 'country': 'US'},
        'zelenskyy': {'name': 'Volodymyr Zelenskyy', 'role': 'President of Ukraine', 'country': 'UA'},
        'zelensky': {'name': 'Volodymyr Zelenskyy', 'role': 'President of Ukraine', 'country': 'UA'},
        'netanyahu': {'name': 'Benjamin Netanyahu', 'role': 'Prime Minister of Israel', 'country': 'IL'},
        'xi jinping': {'name': 'Xi Jinping', 'role': 'President of China', 'country': 'CN'},
        'erdogan': {'name': 'Recep Tayyip Erdogan', 'role': 'President of Turkey', 'country': 'TR'},
        'khamenei': {'name': 'Ali Khamenei', 'role': 'Supreme Leader of Iran', 'country': 'IR'},
        'modi': {'name': 'Narendra Modi', 'role': 'Prime Minister of India', 'country': 'IN'},
        'macron': {'name': 'Emmanuel Macron', 'role': 'President of France', 'country': 'FR'},
        'scholz': {'name': 'Olaf Scholz', 'role': 'Chancellor of Germany', 'country': 'DE'},
        'sunak': {'name': 'Rishi Sunak', 'role': 'PM of UK', 'country': 'GB'},
        'starmer': {'name': 'Keir Starmer', 'role': 'PM of UK', 'country': 'GB'},
        'harris': {'name': 'Kamala Harris', 'role': 'US Vice President', 'country': 'US'},
    }
    
    ORGANIZATIONS = {
        'nato': {'name': 'NATO', 'full': 'North Atlantic Treaty Organization'},
        'un': {'name': 'UN', 'full': 'United Nations'},
        'eu': {'name': 'EU', 'full': 'European Union'},
        'idf': {'name': 'IDF', 'full': 'Israel Defense Forces'},
        'hamas': {'name': 'Hamas', 'full': 'Hamas militant group'},
        'hezbollah': {'name': 'Hezbollah', 'full': 'Hezbollah militant group'},
        'pentagon': {'name': 'Pentagon', 'full': 'US Department of Defense'},
        'kremlin': {'name': 'Kremlin', 'full': 'Russian presidential administration'},
        'white house': {'name': 'White House', 'full': 'US presidential administration'},
    }
    
    COUNTRIES = {
        'iran': {'code': 'IR', 'name': 'Iran', 'region': 'Middle East'},
        'israel': {'code': 'IL', 'name': 'Israel', 'region': 'Middle East'},
        'ukraine': {'code': 'UA', 'name': 'Ukraine', 'region': 'Europe'},
        'russia': {'code': 'RU', 'name': 'Russia', 'region': 'Europe/Asia'},
        'china': {'code': 'CN', 'name': 'China', 'region': 'Asia'},
        'gaza': {'code': 'PS', 'name': 'Gaza', 'region': 'Middle East'},
        'palestine': {'code': 'PS', 'name': 'Palestine', 'region': 'Middle East'},
        'syria': {'code': 'SY', 'name': 'Syria', 'region': 'Middle East'},
        'iraq': {'code': 'IQ', 'name': 'Iraq', 'region': 'Middle East'},
        'lebanon': {'code': 'LB', 'name': 'Lebanon', 'region': 'Middle East'},
        'yemen': {'code': 'YE', 'name': 'Yemen', 'region': 'Middle East'},
        'taiwan': {'code': 'TW', 'name': 'Taiwan', 'region': 'Asia'},
        'north korea': {'code': 'KP', 'name': 'North Korea', 'region': 'Asia'},
        'us': {'code': 'US', 'name': 'United States', 'region': 'North America'},
        'uk': {'code': 'GB', 'name': 'United Kingdom', 'region': 'Europe'},
        'germany': {'code': 'DE', 'name': 'Germany', 'region': 'Europe'},
        'france': {'code': 'FR', 'name': 'France', 'region': 'Europe'},
    }
    
    def extract(self, text: str) -> Dict:
        """Extract all entities from text"""
        text_lower = text.lower()
        
        entities = {
            'people': [],
            'organizations': [],
            'countries': [],
            'numbers': [],
            'dates': []
        }
        
        # Extract leaders
        for key, data in self.WORLD_LEADERS.items():
            if key in text_lower:
                entities['people'].append({
                    'name': data['name'],
                    'role': data['role'],
                    'country': data['country']
                })
        
        # Extract organizations
        for key, data in self.ORGANIZATIONS.items():
            if key in text_lower:
                entities['organizations'].append({
                    'name': data['name'],
                    'full': data['full']
                })
        
        # Extract countries
        for key, data in self.COUNTRIES.items():
            if key in text_lower:
                entities['countries'].append({
                    'code': data['code'],
                    'name': data['name'],
                    'region': data['region']
                })
        
        # Extract numbers with context
        numbers = re.findall(r'\$[\d,]+[bm]?|\d+[,.]?\d*\s*(?:million|billion|thousand)', text_lower)
        numbers += re.findall(r'\d+\s*(?:dead|killed|injured|troops|people|percent|%)', text_lower)
        entities['numbers'] = list(set(numbers))[:5]
        
        # Extract dates
        dates = re.findall(r'\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}\b', text)
        dates += re.findall(r'\b\d{1,2}/\d{1,2}/\d{4}\b', text)
        entities['dates'] = list(set(dates))
        
        # Remove duplicates
        for key in ['people', 'organizations', 'countries']:
            seen = set()
            unique = []
            for item in entities[key]:
                identifier = item.get('name', str(item))
                if identifier not in seen:
                    seen.add(identifier)
                    unique.append(item)
            entities[key] = unique
        
        return entities


class MultiSourceSearcher:
    """Search multiple sources for verification"""
    
    # Source tiers with reliability scores
    SOURCE_TIERS = {
        1: ['reuters.com', 'apnews.com', 'bbc.com', 'bbc.co.uk', 'npr.org', 'economist.com', 'ft.com'],
        2: ['guardian.com', 'theguardian.com', 'aljazeera.com', 'dw.com', 'france24.com', 'cnn.com', 'axios.com', 'wsj.com', 'nytimes.com'],
        3: ['foxnews.com', 'msnbc.com', 'dailymail.co.uk', 'nypost.com'],
        4: []  # Unknown sources
    }
    
    def __init__(self):
        self.ddg_url = "https://html.duckduckgo.com/html/"
    
    def get_source_tier(self, url: str) -> int:
        """Get reliability tier for a source"""
        for tier, domains in self.SOURCE_TIERS.items():
            for domain in domains:
                if domain in url:
                    return tier
        return 4
    
    def search_duckduckgo(self, query: str, max_results: int = 10) -> List[Dict]:
        """Search DuckDuckGo for results"""
        results = []
        try:
            headers = {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
            params = {'q': query}
            resp = requests.post(self.ddg_url, headers=headers, data=params, timeout=15)
            
            if resp.status_code == 200:
                # Parse results
                titles = re.findall(r'<a[^>]*class="result__a"[^>]*>([^<]+)</a>', resp.text)
                urls = re.findall(r'<a[^>]*class="result__url"[^>]*>([^<]+)</a>', resp.text)
                snippets = re.findall(r'<a[^>]*class="result__snippet"[^>]*>([^<]+)</a>', resp.text)
                
                for i in range(min(len(titles), max_results)):
                    url = urls[i].strip() if i < len(urls) else ''
                    results.append({
                        'title': titles[i].strip(),
                        'url': 'https://' + url if url and not url.startswith('http') else url,
                        'snippet': snippets[i].strip() if i < len(snippets) else '',
                        'tier': self.get_source_tier(url),
                        'source': 'search'
                    })
        except Exception as e:
            print(f"  [SEARCH ERROR] {e}")
        
        return results
    
    def search_fact_checkers(self, query: str) -> List[Dict]:
        """Search fact-checking sites"""
        results = []
        fact_checkers = [
            'site:snopes.com',
            'site:politifact.com',
            'site:factcheck.org',
            'site:fullfact.org'
        ]
        
        for fc in fact_checkers:
            fc_query = f"{fc} {query}"
            fc_results = self.search_duckduckgo(fc_query, max_results=2)
            for r in fc_results:
                r['type'] = 'fact_check'
            results.extend(fc_results)
        
        return results
    
    def search_official_sources(self, query: str) -> List[Dict]:
        """Search official government sources"""
        results = []
        official_sites = [
            'site:gov',
            'site:gov.uk',
            'site:europa.eu',
            'site:un.org'
        ]
        
        for os in official_sites:
            os_query = f"{os} {query}"
            os_results = self.search_duckduckgo(os_query, max_results=2)
            for r in os_results:
                r['type'] = 'official'
            results.extend(os_results)
        
        return results


class ResearchEngine:
    """Main research engine combining all components"""
    
    def __init__(self):
        self.wiki = WikipediaAPI()
        self.entity_extractor = EnhancedEntityExtractor()
        self.searcher = MultiSourceSearcher()
        self.headers = {
            'apikey': SERVICE_KEY,
            'Authorization': f'Bearer {SERVICE_KEY}',
            'Content-Type': 'application/json'
        }
    
    def research_story(self, headline: str, summary: str = '') -> Dict:
        """Perform comprehensive research on a story"""
        print(f"\n[RESEARCH] {headline[:60]}...")
        
        combined = f"{headline} {summary}"
        
        # Extract entities
        entities = self.entity_extractor.extract(combined)
        print(f"  Entities: {len(entities.get('people', []))} people, {len(entities.get('countries', []))} countries")
        
        # Get Wikipedia context
        context = {}
        if entities.get('countries'):
            for country in entities['countries'][:2]:
                wiki_data = self.wiki.get_context_for_entity(country['name'], 'country')
                if wiki_data:
                    context[country['name']] = wiki_data
                    print(f"  [WIKI] Got context for {country['name']}")
        
        # Multi-source search
        keywords = self._extract_keywords(combined)
        all_results = []
        
        for keyword_set in keywords[:2]:
            print(f"  [SEARCH] {keyword_set[:40]}...")
            results = self.searcher.search_duckduckgo(keyword_set)
            all_results.extend(results)
        
        # Fact-checker search
        print("  [FACT-CHECK] Searching...")
        fc_results = self.searcher.search_fact_checkers(headline)
        all_results.extend(fc_results)
        
        # Official source search
        print("  [OFFICIAL] Searching...")
        official_results = self.searcher.search_official_sources(headline)
        all_results.extend(official_results)
        
        print(f"  [TOTAL] {len(all_results)} sources found")
        
        return {
            'entities': entities,
            'context': context,
            'sources': all_results,
            'source_count': len(all_results),
            'tier1_count': sum(1 for r in all_results if r.get('tier') == 1),
            'fact_check_count': sum(1 for r in all_results if r.get('type') == 'fact_check'),
            'official_count': sum(1 for r in all_results if r.get('type') == 'official')
        }
    
    def _extract_keywords(self, text: str) -> List[str]:
        """Extract keyword sets for searching"""
        # Remove common words
        stop_words = {'this', 'that', 'with', 'from', 'have', 'been', 'will', 'would', 
                     'could', 'about', 'after', 'before', 'into', 'through', 'during',
                     'breaking', 'shocking', 'urgent', 'news', 'report', 'reports'}
        
        words = re.findall(r'\b[a-z]{4,}\b', text.lower())
        keywords = [w for w in words if w not in stop_words]
        
        # Create search queries
        queries = []
        
        # First query: top 4 keywords
        if keywords:
            queries.append(' '.join(keywords[:4]))
        
        # Second query: different keywords
        if len(keywords) > 4:
            queries.append(' '.join(keywords[4:8]))
        
        return queries
    
    def find_related_stories(self, story_id: str, entities: Dict, hours: int = 72) -> List[Dict]:
        """Find related stories in database"""
        related = []
        
        # Get country codes from entities
        country_codes = [c['code'] for c in entities.get('countries', [])]
        if not country_codes:
            return []
        
        cutoff = (datetime.now(timezone.utc) - timedelta(hours=hours)).isoformat()
        
        try:
            resp = requests.get(
                f"{SUPABASE_URL}/rest/v1/stories",
                headers=self.headers,
                params={
                    'select': 'id,headline,created_at,country_name',
                    'country_code': f'in.({",".join(country_codes)})',
                    'created_at': f'gte.{cutoff}',
                    'id': f'neq.{story_id}',
                    'order': 'created_at.desc',
                    'limit': 5
                }
            )
            
            if resp.status_code == 200:
                related = resp.json()
        except Exception as e:
            print(f"  [RELATED ERROR] {e}")
        
        return related


if __name__ == '__main__':
    # Test the research engine
    engine = ResearchEngine()
    
    test_headline = "Iran launches missile attack on Israel following general's assassination"
    test_summary = "Missiles fired from Iranian territory toward Tel Aviv"
    
    result = engine.research_story(test_headline, test_summary)
    
    print("\n" + "="*60)
    print("RESEARCH RESULTS")
    print("="*60)
    print(f"\nEntities: {json.dumps(result['entities'], indent=2)}")
    print(f"\nSources found: {result['source_count']}")
    print(f"Tier 1 sources: {result['tier1_count']}")
    print(f"Fact-check sources: {result['fact_check_count']}")
    print(f"Official sources: {result['official_count']}")
