#!/usr/bin/env python3
"""
Professional Analysis Generator v5
Generates human-like journalist analysis from research data
"""

import re
import json
from datetime import datetime, timezone
from typing import Dict, List, Optional


class ProfessionalAnalysisGenerator:
    """Generate professional-grade analysis output"""
    
    def __init__(self):
        self.confidence_thresholds = {
            'high': 80,
            'medium': 60,
            'low': 40
        }
    
    def calculate_confidence(self, research: Dict, claims: List[Dict]) -> int:
        """Calculate overall confidence score (0-100)"""
        score = 30  # Base
        
        # Source corroboration bonus
        total_sources = research.get('source_count', 0)
        tier1_sources = research.get('tier1_count', 0)
        
        if total_sources >= 5:
            score += 10
        if total_sources >= 10:
            score += 10
        if tier1_sources >= 2:
            score += 15
        if tier1_sources >= 4:
            score += 10
        
        # Fact-check bonus
        if research.get('fact_check_count', 0) > 0:
            score += 10
        
        # Official source bonus
        if research.get('official_count', 0) > 0:
            score += 10
        
        # Claim verification bonus
        verified_claims = sum(1 for c in claims if c.get('verified', False))
        if verified_claims > 0:
            score += min(verified_claims * 5, 15)
        
        return min(score, 100)
    
    def extract_claims_from_text(self, headline: str, summary: str = '') -> List[Dict]:
        """Extract verifiable claims from text"""
        claims = []
        combined = f"{headline}. {summary}" if summary else headline
        
        # Split into sentences
        sentences = re.split(r'(?<=[.!?])\s+', combined)
        
        for sentence in sentences:
            sentence = sentence.strip()
            if len(sentence) < 15:
                continue
            
            # Score claim worthiness
            worthiness = 0
            
            # Contains numbers (dates, stats, etc)
            if re.search(r'\d+', sentence):
                worthiness += 2
            
            # Contains named entities
            entity_words = ['iran', 'israel', 'russia', 'ukraine', 'china', 'us', 'trump', 'biden',
                          'putin', 'zelenskyy', 'netanyahu', 'nato', 'un', 'eu']
            for word in entity_words:
                if word in sentence.lower():
                    worthiness += 2
                    break
            
            # Contains verification-worthy verbs
            verify_verbs = ['announced', 'confirmed', 'reported', 'stated', 'said', 'launched',
                          'attacked', 'signed', 'agreed', 'rejected', 'approved']
            for verb in verify_verbs:
                if verb in sentence.lower():
                    worthiness += 1
                    break
            
            if worthiness >= 2:
                claims.append({
                    'text': sentence,
                    'worthiness': worthiness,
                    'verified': False,
                    'status': 'unverified'
                })
        
        # Sort by worthiness
        claims.sort(key=lambda x: x['worthiness'], reverse=True)
        return claims[:5]  # Top 5 claims
    
    def verify_claims(self, claims: List[Dict], sources: List[Dict]) -> List[Dict]:
        """Verify claims against found sources"""
        for claim in claims:
            claim_text = claim['text'].lower()
            
            # Check for supporting evidence in sources
            supporting = []
            contradicting = []
            
            for source in sources:
                snippet = source.get('snippet', '').lower()
                title = source.get('title', '').lower()
                combined = f"{title} {snippet}"
                
                # Check for keyword overlap
                claim_words = set(claim_text.split())
                source_words = set(combined.split())
                overlap = claim_words & source_words
                
                if len(overlap) >= 3:  # At least 3 matching words
                    if source.get('tier', 4) <= 2:  # Tier 1 or 2 source
                        supporting.append(source)
            
            # Determine claim status
            if len(supporting) >= 2:
                claim['verified'] = True
                claim['status'] = 'confirmed'
                claim['sources'] = len(supporting)
            elif len(supporting) == 1:
                claim['verified'] = True
                claim['status'] = 'partially_confirmed'
                claim['sources'] = 1
            elif len(contradicting) > 0:
                claim['verified'] = False
                claim['status'] = 'contested'
            else:
                claim['verified'] = False
                claim['status'] = 'unverified'
        
        return claims
    
    def generate_analysis(self, headline: str, summary: str, research: Dict,
                          related_stories: List[Dict] = None) -> str:
        """Generate human-like journalistic analysis"""
        
        entities = research.get('entities', {})
        sources = research.get('sources', [])
        context = research.get('context', {})
        
        # Extract and verify claims
        claims = self.extract_claims_from_text(headline, summary)
        claims = self.verify_claims(claims, sources)
        
        # Calculate confidence
        confidence = self.calculate_confidence(research, claims)
        
        # Build natural paragraphs
        paragraphs = []
        
        # --- Opening: The Story So Far ---
        opening = self._write_natural_opening(headline, summary, entities, confidence)
        paragraphs.append(opening)
        
        # --- What We Know (confirmed facts) ---
        confirmed_claims = [c for c in claims if c['status'] in ['confirmed', 'partially_confirmed']]
        if confirmed_claims:
            known_para = self._write_what_we_know(confirmed_claims)
            paragraphs.append(known_para)
        
        # --- What's Still Unclear ---
        unconfirmed_claims = [c for c in claims if c['status'] in ['unverified', 'contested']]
        if unconfirmed_claims or not confirmed_claims:
            unknown_para = self._write_what_we_dont_know(unconfirmed_claims, headline)
            paragraphs.append(unknown_para)
        
        # --- The Players (key entities) ---
        if entities and (entities.get('people') or entities.get('countries') or entities.get('organizations')):
            entities_para = self._write_entities_section(entities)
            paragraphs.append(entities_para)
        
        # --- Behind the Headlines (context) ---
        if context:
            context_para = self._write_context_section(context)
            if context_para:
                paragraphs.append(context_para)
        
        # --- The Bigger Picture (related) ---
        if related_stories:
            related_para = self._write_related_section(related_stories)
            paragraphs.append(related_para)
        
        # --- Sources Note (subtle, at end) ---
        sources_note = self._write_sources_note(research, sources)
        paragraphs.append(sources_note)
        
        return "\n\n".join(paragraphs)
    
    def _write_natural_opening(self, headline, summary, entities, confidence):
        """Write a natural opening paragraph"""
        country = ""
        if entities.get('countries'):
            country = entities['countries'][0]['name']
        
        # Natural confidence phrase
        if confidence >= 70:
            conf_phrase = "This story checks out."
        elif confidence >= 50:
            conf_phrase = "The picture is still coming together."
        else:
            conf_phrase = "Details remain sketchy."
        
        # Build opening
        if country:
            opening = f"This story involves {country}. {headline[:100]}"
        else:
            opening = headline[:120]
        
        if summary and len(summary) > 20:
            summary_bit = summary[:150].rsplit('.', 1)[0]
            if summary_bit and summary_bit != headline[:150]:
                opening += f" {summary_bit}."
        
        opening += f" {conf_phrase}"
        return opening

    def _write_what_we_know(self, confirmed_claims):
        """Write natural what we know section"""
        lines = ["What we know:"]
        for claim in confirmed_claims[:4]:
            claim_text = claim['text'][:90].rstrip('.')
            sources_count = claim.get('sources', 1)
            if sources_count >= 2:
                lines.append(f"- {claim_text} (backed by {sources_count} sources)")
            else:
                lines.append(f"- {claim_text}")
        return "\n".join(lines)

    def _write_what_we_dont_know(self, unconfirmed_claims, headline):
        """Write natural what we don't know section"""
        lines = ["What we don't know yet:"]
        if unconfirmed_claims:
            for claim in unconfirmed_claims[:3]:
                claim_text = claim['text'][:80].rstrip('.')
                lines.append(f"- {claim_text} (still unconfirmed)")
        else:
            lines.append("- Full details are still emerging")
            lines.append("- We're waiting for more official confirmation")
        return "\n".join(lines)

    def _write_entities_section(self, entities):
        """Write natural entities section"""
        parts = []
        if entities.get('people'):
            people = entities['people'][:2]
            people_str = ", ".join([p['name'] for p in people])
            parts.append(f"Key figures: {people_str}")
        if entities.get('countries'):
            countries = entities['countries'][:3]
            countries_str = ", ".join([c['name'] for c in countries])
            parts.append(f"Countries involved: {countries_str}")
        if entities.get('organizations'):
            orgs = entities['organizations'][:2]
            orgs_str = ", ".join([o.get('full', o.get('name', '')) for o in orgs])
            parts.append(f"Organizations: {orgs_str}")
        return "\n".join(parts)

    def _write_context_section(self, context):
        """Write natural context/background section"""
        for entity, wiki_data in list(context.items())[:1]:
            extract = wiki_data.get('extract', '')[:180]
            if extract:
                extract = extract.rstrip('.')
                return f"Background: {extract}."
        return ""

    def _write_related_section(self, related_stories):
        """Write related stories section"""
        lines = ["Related coverage:"]
        for story in related_stories[:3]:
            country = story.get('country_name', 'World')
            story_headline = story.get('headline', '')[:70].rstrip('.')
            lines.append(f"- [{country}] {story_headline}")
        return "\n".join(lines)

    def _write_sources_note(self, research, sources):
        """Write subtle sources note at end"""
        tier1 = research.get('tier1_count', 0)
        total = len(sources) if sources else 0
        fact_check = research.get('fact_check_count', 0)
        official = research.get('official_count', 0)
        
        note_parts = []
        if tier1 > 0:
            note_parts.append(f"{tier1} major outlets")
        if official > 0:
            note_parts.append(f"{official} official sources")
        if fact_check > 0:
            note_parts.append(f"{fact_check} fact-checks")
        
        if note_parts:
            return f"Sources: {', '.join(note_parts)}."
        elif total > 0:
            return f"Based on {total} sources."
        else:
            return "Sources: Limited corroboration available."
