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
    """Xray Analysis Engine v3 - Comprehensive verification with real research"""

    STATUS_CONFIRMED = "✅ CONFIRMED"
    STATUS_UNVERIFIED = "❓ UNVERIFIED"  
    STATUS_CONTESTED = "⚠️ CONTESTED"
    STATUS_INSUFFICIENT = "❌ INSUFFICIENT EVIDENCE"

    SOURCE_TIERS = {
        1: {'domains': ['reuters.com', 'apnews.com', 'bbc.com', 'bbc.co.uk', 'npr.org',
                      'economist.com', 'ft.com', 'wsj.com', 'nytimes.com'], 'score': 95},
        2: {'domains': ['guardian.com', 'theguardian.com', 'aljazeera.com', 'dw.com', 
                      'france24.com', 'rfi.fr', 'cnn.com', 'axios.com'], 'score': 80},
        3: {'domains': ['foxnews.com', 'msnbc.com', 'dailymail.co.uk'], 'score': 60},
        4: {'domains': [], 'score': 40}
    }

    FACT_CHECKERS = [
        {'domain': 'snopes.com', 'name': 'Snopes'},
        {'domain': 'politifact.com', 'name': 'PolitiFact'},
        {'domain': 'factcheck.org', 'name': 'FactCheck.org'}
    ]

    def __init__(self, db: SupabaseClient):
        self.db = db

    def fetch_unanalyzed(self, limit: int = 10) -> List[Dict]:
        return self.db.fetch(
            'stories',
            select='id,headline,summary,country_name,category',
            filters={'or': '(xray_analysis.is.null,xray_analysis.eq."",xray_analysis_version.lt.3)'},
            order='created_at.desc',
            limit=limit
        )

    def extract_entities(self, text: str) -> Dict[str, List[str]]:
        """Extract named entities from text"""
        entities = {'people': [], 'places': [], 'organizations': [], 'numbers': []}
        text_lower = text.lower()

        # World leaders
        leaders = ['putin', 'biden', 'trump', 'zelenskyy', 'zelensky', 'xi jinping', 'modi',
                   'macron', 'scholz', 'sunak', 'netanyahu', 'erdogan', 'harris', 'obama']
        for leader in leaders:
            if leader in text_lower:
                entities['people'].append(leader.title())

        # Places
        places = {'ukraine': 'Ukraine', 'russia': 'Russia', 'china': 'China', 'israel': 'Israel',
                  'iran': 'Iran', 'gaza': 'Gaza', 'moscow': 'Moscow', 'kyiv': 'Kyiv',
                  'beijing': 'Beijing', 'washington': 'Washington', 'london': 'London',
                  'europe': 'Europe', 'syria': 'Syria', 'iraq': 'Iraq', 'taiwan': 'Taiwan'}
        for kw, place in places.items():
            if kw in text_lower and place not in entities['places']:
                entities['places'].append(place)

        # Organizations
        orgs = {'nato': 'NATO', 'un': 'UN', 'eu': 'EU', 'pentagon': 'Pentagon',
                'kremlin': 'Kremlin', 'white house': 'White House'}
        for kw, org in orgs.items():
            if kw in text_lower and org not in entities['organizations']:
                entities['organizations'].append(org)

        # Numbers
        numbers = re.findall(r'\$[\d,]+[bm]?|\d+[,.]?\d*\s*(?:million|billion)', text_lower)
        numbers += re.findall(r'\d+\s*(?:dead|killed|injured|troops|%)', text_lower)
        entities['numbers'] = list(set(numbers))[:3]

        return {k: v for k, v in entities.items() if v}

    def extract_claims(self, headline: str, summary: str = '') -> List[Dict]:
        """Break down story into individual verifiable claims"""
        claims = []
        combined = f"{headline}. {summary}" if summary else headline
        sentences = re.split(r'(?<=[.!?])\s+', combined)

        for sentence in sentences:
            sentence = sentence.strip()
            if len(sentence) < 15:
                continue

            worthiness = 0
            if re.search(r'\d+', sentence):
                worthiness += 2
            entities = self.extract_entities(sentence)
            if entities.get('people') or entities.get('places'):
                worthiness += 2
            verify_phrases = ['announced', 'confirmed', 'reported', 'stated', 'said', 'claims']
            if any(p in sentence.lower() for p in verify_phrases):
                worthiness += 1

            claim = re.sub(r'^(breaking|shocking|urgent):\s*', '', sentence, flags=re.IGNORECASE).strip()
            if not claim.endswith('.'):
                claim += '.'

            claims.append({'text': claim, 'worthiness': worthiness, 'entities': entities})

        claims.sort(key=lambda x: x['worthiness'], reverse=True)
        return claims[:4]

    def get_source_tier(self, source_name: str) -> int:
        source_lower = source_name.lower()
        for tier, data in self.SOURCE_TIERS.items():
            if tier == 4:
                continue
            for domain in data['domains']:
                if domain in source_lower:
                    return tier
        return 4

    def search_web(self, query: str) -> List[Dict]:
        """Search DuckDuckGo"""
        results = []
        try:
            url = f"https://html.duckduckgo.com/html/?q={requests.utils.quote(query)}"
            headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0'}
            resp = requests.get(url, headers=headers, timeout=15)

            if resp.status_code == 200:
                titles = re.findall(r'<a[^>]*class="result__a"[^>]*>([^<]+)</a>', resp.text)
                snippets = re.findall(r'<a[^>]*class="result__snippet"[^>]*>([^<]+)</a>', resp.text)

                for title, snippet in zip(titles[:8], snippets[:8]):
                    if title.strip() and snippet.strip():
                        tier = self.get_source_tier(title)
                        results.append({
                            'title': title.strip(),
                            'snippet': snippet.strip(),
                            'tier': tier,
                            'reliability': self.SOURCE_TIERS[tier]['score']
                        })
        except Exception as e:
            print(f"[SEARCH ERROR] {e}")

        return results

    def search_fact_checkers(self, query: str) -> List[Dict]:
        """Search fact-checking sites"""
        results = []
        for fc in self.FACT_CHECKERS:
            try:
                fc_query = f"site:{fc['domain']} {query}"
                url = f"https://html.duckduckgo.com/html/?q={requests.utils.quote(fc_query)}"
                headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120'}
                resp = requests.get(url, headers=headers, timeout=10)

                if resp.status_code == 200:
                    titles = re.findall(r'<a[^>]*class="result__a"[^>]*>([^<]+)</a>', resp.text)
                    snippets = re.findall(r'<a[^>]*class="result__snippet"[^>]*>([^<]+)</a>', resp.text)

                    for title, snippet in zip(titles[:2], snippets[:2]):
                        if title.strip():
                            results.append({
                                'title': title.strip(),
                                'snippet': snippet.strip(),
                                'source': fc['name'],
                                'type': 'fact_check',
                                'reliability': 90
                            })
            except:
                pass
        return results

    def search_official_sources(self, query: str) -> List[Dict]:
        """Search .gov sources"""
        results = []
        for domain in ['.gov', '.gov.uk']:
            try:
                off_query = f"site:{domain} {query}"
                url = f"https://html.duckduckgo.com/html/?q={requests.utils.quote(off_query)}"
                headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120'}
                resp = requests.get(url, headers=headers, timeout=10)

                if resp.status_code == 200:
                    titles = re.findall(r'<a[^>]*class="result__a"[^>]*>([^<]+)</a>', resp.text)
                    snippets = re.findall(r'<a[^>]*class="result__snippet"[^>]*>([^<]+)</a>', resp.text)

                    for title, snippet in zip(titles[:2], snippets[:2]):
                        if title.strip():
                            results.append({
                                'title': title.strip(),
                                'snippet': snippet.strip(),
                                'type': 'official',
                                'reliability': 95
                            })
            except:
                pass
        return results

    def verify_claim(self, claim: Dict, all_results: List[Dict]) -> Dict:
        """Verify a single claim"""
        claim_text = claim['text'].lower()
        claim_entities = claim.get('entities', {})

        confirming = []
        conflicting = []

        confirm_words = ['confirmed', 'announced', 'official', 'verified', 'reports']
        conflict_words = ['denied', 'false', 'debunked', 'disputed', 'unverified']

        for r in all_results:
            combined = (r.get('title', '') + ' ' + r.get('snippet', '')).lower()

            # Entity overlap
            result_entities = self.extract_entities(r['title'])
            entity_overlap = 0
            for etype in ['people', 'places']:
                claim_e = set(e.lower() for e in claim_entities.get(etype, []))
                result_e = set(e.lower() for e in result_entities.get(etype, []))
                entity_overlap += len(claim_e & result_e)

            # Keyword overlap
            claim_keywords = set(re.findall(r'\b[a-z]{4,}\b', claim_text))
            result_keywords = set(re.findall(r'\b[a-z]{4,}\b', combined))
            keyword_overlap = len(claim_keywords & result_keywords)

            if entity_overlap >= 1 or keyword_overlap >= 3:
                has_confirm = any(w in combined for w in confirm_words)
                has_conflict = any(w in combined for w in conflict_words)

                entry = {'title': r['title'][:50], 'reliability': r.get('reliability', 50)}

                if r.get('type') == 'fact_check' and has_conflict:
                    conflicting.append(entry)
                elif r.get('type') == 'official' and not has_conflict:
                    confirming.append(entry)
                elif has_confirm and not has_conflict:
                    confirming.append(entry)
                elif has_conflict and not has_confirm:
                    conflicting.append(entry)
                elif keyword_overlap >= 4:
                    confirming.append(entry)

        confirm_score = sum(c['reliability'] for c in confirming) / 100 if confirming else 0
        conflict_score = sum(c['reliability'] for c in conflicting) / 100 if conflicting else 0

        if confirm_score >= 1.5 and conflict_score < 0.5:
            verdict = self.STATUS_CONFIRMED
        elif conflict_score >= 1.0:
            verdict = self.STATUS_CONTESTED
        elif confirm_score > 0:
            verdict = self.STATUS_UNVERIFIED
        else:
            verdict = self.STATUS_INSUFFICIENT

        return {
            'claim': claim['text'],
            'verdict': verdict,
            'confirming': confirming[:3],
            'conflicting': conflicting[:2]
        }

    def generate_analysis(self, story: Dict) -> str:
        """Generate comprehensive v3 analysis"""
        headline = story.get('headline', '')
        summary = story.get('summary', '')

        print(f"[v3] Analyzing: {headline[:50]}...")

        # Extract entities
        entities = self.extract_entities(f"{headline} {summary}")

        # Extract claims
        claims = self.extract_claims(headline, summary)

        # Build search queries
        entity_terms = []
        for etype in ['people', 'places']:
            entity_terms.extend(entities.get(etype, [])[:2])

        queries = []
        if entity_terms:
            queries.append(' '.join(entity_terms[:3]))
        keywords = re.findall(r'\b[a-z]{4,}\b', headline.lower())
        common = {'this', 'that', 'with', 'from', 'have', 'been', 'will', 'would'}
        keywords = [k for k in keywords if k not in common][:4]
        if keywords:
            queries.append(' '.join(keywords))

        # Multi-source search
        all_results = []
        seen_titles = set()

        for query in queries[:2]:
            print(f"  [SEARCH] {query[:30]}...")
            for r in self.search_web(query):
                tkey = r['title'].lower()[:40]
                if tkey not in seen_titles:
                    seen_titles.add(tkey)
                    all_results.append(r)

        # Fact-checker search
        if queries:
            print("  [FACT-CHECK]...")
            all_results.extend(self.search_fact_checkers(queries[0]))

        # Official source search
        if queries:
            print("  [OFFICIAL]...")
            all_results.extend(self.search_official_sources(queries[0]))

        print(f"  [FOUND] {len(all_results)} sources")

        # Verify claims
        claim_verifications = [self.verify_claim(c, all_results) for c in claims]

        # Overall verdict
        if claim_verifications:
            confirmed = sum(1 for cv in claim_verifications if 'CONFIRMED' in cv['verdict'])
            contested = sum(1 for cv in claim_verifications if 'CONTESTED' in cv['verdict'])

            if confirmed == len(claim_verifications):
                overall = self.STATUS_CONFIRMED
            elif confirmed > contested:
                overall = "✅ MOSTLY CONFIRMED"
            elif contested > confirmed:
                overall = self.STATUS_CONTESTED
            else:
                overall = self.STATUS_UNVERIFIED
        else:
            overall = self.STATUS_INSUFFICIENT

        # Build output
        lines = [f"**VERIFICATION: {overall}**", ""]

        # Entities
        if entities:
            entity_parts = []
            if entities.get('people'):
                entity_parts.append(f"People: {', '.join(entities['people'][:3])}")
            if entities.get('places'):
                entity_parts.append(f"Places: {', '.join(entities['places'][:3])}")
            if entities.get('organizations'):
                entity_parts.append(f"Orgs: {', '.join(entities['organizations'][:2])}")
            if entity_parts:
                lines.append("**KEY ENTITIES:**")
                lines.append(' | '.join(entity_parts))
                lines.append("")

        # Claim analysis
        if claim_verifications:
            lines.append("**CLAIM ANALYSIS:**")
            for i, cv in enumerate(claim_verifications, 1):
                claim_short = cv['claim'][:50] + "..." if len(cv['claim']) > 50 else cv['claim']
                lines.append(f"{i}. {claim_short}")
                lines.append(f"   → {cv['verdict']}")
            lines.append("")

        # Source quality
        if all_results:
            tier1 = sum(1 for r in all_results if r.get('tier') == 1)
            official = sum(1 for r in all_results if r.get('type') == 'official')
            factcheck = sum(1 for r in all_results if r.get('type') == 'fact_check')

            lines.append("**SOURCES:**")
            parts = [f"{len(all_results)} total"]
            if tier1: parts.append(f"{tier1} Tier-1")
            if official: parts.append(f"{official} official")
            if factcheck: parts.append(f"{factcheck} fact-check")
            lines.append(' | '.join(parts))
            lines.append("")

        # Conclusion
        lines.append("**CONCLUSION:**")
        if 'CONFIRMED' in overall:
            lines.append(f"Verified by multiple sources. High confidence in accuracy.")
        elif 'CONTESTED' in overall:
            lines.append(f"Mixed reporting. Verify with additional sources.")
        elif 'UNVERIFIED' in overall:
            lines.append(f"Insufficient coverage. Cannot fully confirm.")
        else:
            lines.append(f"No independent sources found. Unable to verify.")

        return '\n'.join(lines)

    def run(self, limit: int = 10, verbose: bool = True) -> int:
        stories = self.fetch_unanalyzed(limit)
        if not stories:
            if verbose:
                print("[v3] No stories need analysis")
            return 0

        success = 0
        for i, story in enumerate(stories):
            if verbose:
                print(f"[v3 {i+1}/{len(stories)}] {story.get('headline', '')[:40]}...")

            analysis = self.generate_analysis(story)

            if self.db.update('stories', story['id'], {
                'xray_analysis': analysis,
                'xray_analysis_at': datetime.now(timezone.utc).isoformat(),
                'xray_analysis_version': 3
            }):
                if verbose:
                    print("  [SAVED]")
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
