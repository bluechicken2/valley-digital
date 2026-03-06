#!/usr/bin/env python3
"""
XrayNews - Independent AI Analysis Engine
Generates unbiased story summaries using web research
"""

import os
import sys
import json
import requests
import re
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any

# Supabase config
SUPABASE_URL = os.environ.get('SUPABASE_URL', 'https://dkxydhuojaspmbpjfyoz.supabase.co')
SUPABASE_SERVICE_KEY = os.environ.get('SERVICE_ROLE_SUPABASE', '')

class AnalysisEngine:
    """Generates independent AI analysis for news stories"""
    
    def __init__(self):
        self.supabase_url = SUPABASE_URL
        self.service_key = SUPABASE_SERVICE_KEY
        self.headers = {
            'apikey': self.service_key,
            'Authorization': f'Bearer {self.service_key}',
            'Content-Type': 'application/json',
            'Prefer': 'return=representation'
        }
        
    def fetch_stories_needing_analysis(self, limit: int = 10) -> List[Dict]:
        """Fetch stories that don't have analysis yet"""
        url = f"{self.supabase_url}/rest/v1/stories"
        params = {
            'select': 'id,headline,summary,country_code,country_name,category,xray_score,status,source_name,created_at',
            'or': '(xray_analysis.is.null,xray_analysis.eq."")',
            'order': 'created_at.desc',
            'limit': str(limit)
        }
        
        resp = requests.get(url, headers=self.headers, params=params)
        if resp.status_code != 200:
            print(f"[ERROR] Failed to fetch stories: {resp.status_code} {resp.text}")
            return []
        
        return resp.json()
    
    def update_story_analysis(self, story_id: str, analysis: str) -> bool:
        """Update story with generated analysis"""
        url = f"{self.supabase_url}/rest/v1/stories"
        params = {'id': f'eq.{story_id}'}
        data = {
            'xray_analysis': analysis,
            'xray_analysis_at': datetime.now(timezone.utc).isoformat(),
            'xray_analysis_version': 1
        }
        
        resp = requests.patch(url, headers=self.headers, params=params, json=data)
        if resp.status_code not in [200, 204]:
            print(f"[ERROR] Failed to update story {story_id}: {resp.status_code} {resp.text}")
            return False
        return True
    
    def search_web(self, query: str) -> List[Dict]:
        """Search the web for information (using DuckDuckGo HTML)"""
        results = []
        try:
            # Use DuckDuckGo HTML version for simple scraping
            url = f"https://html.duckduckgo.com/html/?q={requests.utils.quote(query)}"
            headers = {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
            resp = requests.get(url, headers=headers, timeout=10)
            
            if resp.status_code == 200:
                # Extract result snippets from HTML
                snippets = re.findall(r'<a[^>]*class="result__a"[^>]*>([^<]+)</a>', resp.text)
                abstracts = re.findall(r'<a[^>]*class="result__snippet"[^>]*>([^<]+)</a>', resp.text)
                
                for i, (title, abstract) in enumerate(zip(snippets[:5], abstracts[:5])):
                    results.append({
                        'title': title.strip(),
                        'snippet': abstract.strip() if abstract else ''
                    })
        except Exception as e:
            print(f"[WARN] Web search failed: {e}")
        
        return results
    
    def extract_key_entities(self, headline: str, summary: str = '') -> List[str]:
        """Extract key entities (countries, people, organizations) from text"""
        text = f"{headline} {summary}".lower()
        
        # Common entities to look for
        entities = []
        
        # Countries (common ones in news)
        countries = ['israel', 'iran', 'ukraine', 'russia', 'china', 'usa', 'united states', 
                    'palestine', 'gaza', 'lebanon', 'syria', 'yemen', 'sudan', 'myanmar',
                    'uk', 'britain', 'germany', 'france', 'eu', 'europe', 'nato']
        for c in countries:
            if c in text:
                entities.append(c.title())
        
        # Key terms that indicate topic
        topic_terms = ['election', 'war', 'conflict', 'attack', 'strike', 'ceasefire',
                      'sanctions', 'treaty', 'summit', 'negotiations', 'military',
                      'nuclear', 'trade', 'economy', 'climate', 'protest', 'coup']
        for t in topic_terms:
            if t in text:
                entities.append(t.title())
        
        return list(set(entities))[:5]
    
    def generate_analysis(self, story: Dict) -> str:
        """Generate independent analysis for a story"""
        headline = story.get('headline', '')
        summary = story.get('summary', '')
        country = story.get('country_name', '')
        category = story.get('category', '')
        
        # Extract entities for search
        entities = self.extract_key_entities(headline, summary)
        
        # Build search query
        search_query = f"{headline} {country} {category}".strip()
        search_query = re.sub(r'[^\w\s]', ' ', search_query)[:100]
        
        # Search for additional context
        search_results = self.search_web(search_query)
        
        # Build analysis
        analysis_parts = []
        
        # 1. What happened (based on headline/summary)
        what_happened = self._summarize_what_happened(headline, summary, country)
        analysis_parts.append(what_happened)
        
        # 2. Context (from search results if available)
        if search_results:
            context = self._extract_context(search_results, entities)
            if context:
                analysis_parts.append(context)
        
        # 3. Why it matters (generic but relevant)
        significance = self._assess_significance(headline, category, country)
        analysis_parts.append(significance)
        
        # Combine into final analysis
        analysis = ' '.join(analysis_parts)
        
        # Ensure it's concise (~100 words)
        words = analysis.split()
        if len(words) > 120:
            analysis = ' '.join(words[:120]) + '.'
        
        return analysis
    
    def _summarize_what_happened(self, headline: str, summary: str, country: str) -> str:
        """Create a neutral summary of what happened"""
        # Use the headline as base, clean it up
        text = headline
        
        # Remove sensational language
        sensational = ['breaking', 'shocking', 'bombshell', 'explosive', 'massive', 
                      'huge', 'stunning', 'incredible', 'bizarre']
        for word in sensational:
            text = re.sub(rf'\b{word}\b', '', text, flags=re.IGNORECASE)
        
        # Clean up
        text = re.sub(r'\s+', ' ', text).strip()
        
        # Add country context if not in headline
        if country and country.lower() not in text.lower():
            text = f"In {country}, {text[0].lower()}{text[1:]}"
        
        # Ensure proper sentence structure
        if not text.endswith('.'):
            text += '.'
        
        # Add summary details if available and different from headline
        if summary and len(summary) > 50:
            # Extract first meaningful sentence from summary
            summary_sentences = re.split(r'[.!?]', summary)
            for sentence in summary_sentences:
                sentence = sentence.strip()
                if len(sentence) > 20 and sentence.lower() not in headline.lower():
                    text += f" {sentence}."
                    break
        
        return text
    
    def _extract_context(self, search_results: List[Dict], entities: List[str]) -> str:
        """Extract relevant context from search results"""
        context_snippets = []
        
        for result in search_results[:3]:
            snippet = result.get('snippet', '')
            if snippet and len(snippet) > 30:
                # Check if relevant to entities
                snippet_lower = snippet.lower()
                relevance_score = sum(1 for e in entities if e.lower() in snippet_lower)
                
                if relevance_score > 0:
                    # Clean and add snippet
                    snippet = re.sub(r'<[^>]+>', '', snippet)  # Remove HTML
                    snippet = snippet.strip()
                    if len(snippet) > 50:
                        context_snippets.append(snippet[:150])
        
        if context_snippets:
            return f"Background: {' '.join(context_snippets[:2])}"
        return ''
    
    def _assess_significance(self, headline: str, category: str, country: str) -> str:
        """Assess why this story matters"""
        headline_lower = headline.lower()
        
        # Category-specific significance
        significance_templates = {
            'War & Conflict': [
                'This development could impact regional stability',
                'The situation continues to evolve with humanitarian implications',
                'International observers are monitoring for escalation risks'
            ],
            'Politics': [
                'This has implications for domestic and foreign policy',
                'Political analysts are watching for potential ripple effects',
                'The development may influence upcoming political decisions'
            ],
            'Economy': [
                'Markets and economic analysts are assessing potential impacts',
                'This could affect trade and economic relations',
                'Economic implications are being evaluated by experts'
            ],
            'Elections': [
                'This development may influence voter sentiment',
                'Electoral outcomes could shift based on these events',
                'The political landscape continues to evolve'
            ],
            'Weather & Disaster': [
                'Emergency response efforts are ongoing',
                'Humanitarian assistance may be required',
                'Authorities are coordinating relief efforts'
            ],
            'Health': [
                'Public health officials are monitoring the situation',
                'Health authorities are coordinating response measures',
                'Medical resources are being assessed'
            ],
            'Science & Tech': [
                'This development has implications for the technology sector',
                'Industry analysts are evaluating potential impacts',
                'The innovation could influence future developments'
            ],
            'Environment': [
                'Environmental impacts are being assessed',
                'Climate implications may extend beyond the immediate region',
                'Conservation efforts are under evaluation'
            ]
        }
        
        templates = significance_templates.get(category, [
            'This development is being monitored by analysts',
            'Further updates are expected as the situation develops'
        ])
        
        # Select appropriate significance based on headline content
        if any(word in headline_lower for word in ['escalat', 'intensif', 'surge', 'spike']):
            return templates[0] if templates else 'The situation is developing.'
        elif any(word in headline_lower for word in ['peace', 'ceasefire', 'agreement', 'deal']):
            return 'Diplomatic efforts continue to shape the outcome.'
        else:
            return templates[-1] if templates else 'The situation continues to develop.'
    
    def run(self, limit: int = 10, verbose: bool = True):
        """Main entry point - analyze stories"""
        print(f"\n{'='*50}")
        print(f"XRAY ANALYSIS ENGINE")
        print(f"{'='*50}")
        print(f"Started: {datetime.now().isoformat()}")
        print(f"Limit: {limit} stories")
        
        if not self.service_key:
            print("[ERROR] SERVICE_ROLE_SUPABASE not set")
            return
        
        # Fetch stories needing analysis
        stories = self.fetch_stories_needing_analysis(limit)
        
        if not stories:
            print("\n[INFO] No stories need analysis")
            return
        
        print(f"\n[INFO] Found {len(stories)} stories needing analysis")
        
        success_count = 0
        
        for i, story in enumerate(stories):
            story_id = story.get('id')
            headline = story.get('headline', '')[:60]
            
            if verbose:
                print(f"\n[{i+1}/{len(stories)}] Analyzing: {headline}...")
            
            try:
                # Generate analysis
                analysis = self.generate_analysis(story)
                
                # Update database
                if self.update_story_analysis(story_id, analysis):
                    success_count += 1
                    if verbose:
                        print(f"  ✓ Analysis: {analysis[:80]}...")
                else:
                    print(f"  ✗ Failed to update")
                    
            except Exception as e:
                print(f"  ✗ Error: {e}")
                continue
        
        print(f"\n{'='*50}")
        print(f"COMPLETE: {success_count}/{len(stories)} stories analyzed")
        print(f"{'='*50}")


def main():
    import argparse
    parser = argparse.ArgumentParser(description='XrayNews Analysis Engine')
    parser.add_argument('--limit', type=int, default=10, help='Max stories to analyze')
    parser.add_argument('--quiet', action='store_true', help='Less output')
    args = parser.parse_args()
    
    engine = AnalysisEngine()
    engine.run(limit=args.limit, verbose=not args.quiet)


if __name__ == '__main__':
    main()
