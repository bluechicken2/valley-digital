#!/usr/bin/env python3
"""
Professional Analysis Generator v4
Generates journalist-quality analysis from research data
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
        """Generate professional analysis output"""
        
        entities = research.get('entities', {})
        sources = research.get('sources', [])
        context = research.get('context', {})
        
        # Extract and verify claims
        claims = self.extract_claims_from_text(headline, summary)
        claims = self.verify_claims(claims, sources)
        
        # Calculate confidence
        confidence = self.calculate_confidence(research, claims)
        
        # Build output sections
        lines = []
        
        # ============================================
        # EXECUTIVE SUMMARY
        # ============================================
        lines.append("## 📰 EXECUTIVE SUMMARY")
        lines.append("")
        
        # Generate 1-2 sentence summary
        exec_summary = self._generate_exec_summary(headline, summary, entities)
        lines.append(exec_summary)
        lines.append("")
        
        # ============================================
        # CONFIDENCE SCORE
        # ============================================
        confidence_emoji = "🟢" if confidence >= 70 else "🟡" if confidence >= 50 else "🔴"
        lines.append(f"**{confidence_emoji} CONFIDENCE: {confidence}%**")
        lines.append("")
        
        # ============================================
        # WHAT WE KNOW
        # ============================================
        confirmed_claims = [c for c in claims if c['status'] in ['confirmed', 'partially_confirmed']]
        if confirmed_claims:
            lines.append("## ✅ WHAT WE KNOW")
            lines.append("")
            for claim in confirmed_claims[:5]:
                status_icon = "✓" if claim['status'] == 'confirmed' else "~"
                claim_text = claim['text'][:100] + "..." if len(claim['text']) > 100 else claim['text']
                sources_count = claim.get('sources', 0)
                lines.append(f"• {status_icon} {claim_text}")
                lines.append(f"  _({sources_count} sources confirm)_")
            lines.append("")
        
        # ============================================
        # WHAT WE DON'T KNOW
        # ============================================
        unconfirmed_claims = [c for c in claims if c['status'] in ['unverified', 'contested']]
        if unconfirmed_claims or not confirmed_claims:
            lines.append("## ❓ WHAT WE DON'T KNOW")
            lines.append("")
            if unconfirmed_claims:
                for claim in unconfirmed_claims[:3]:
                    claim_text = claim['text'][:80] + "..." if len(claim['text']) > 80 else claim['text']
                    lines.append(f"• {claim_text} - **Unconfirmed**")
            else:
                lines.append("• Specific details are still emerging")
                lines.append("• Official statements may be pending")
            lines.append("")
        
        # ============================================
        # KEY ENTITIES
        # ============================================
        if entities:
            lines.append("## 🔍 KEY ENTITIES")
            lines.append("")
            
            if entities.get('people'):
                people = entities['people'][:3]
                people_str = ' | '.join([f"{p['name']} ({p.get('role', 'Official')})" for p in people])
                lines.append(f"**People:** {people_str}")
            
            if entities.get('countries'):
                countries = entities['countries'][:3]
                countries_str = ' | '.join([c['name'] for c in countries])
                lines.append(f"**Countries:** {countries_str}")
            
            if entities.get('organizations'):
                orgs = entities['organizations'][:3]
                orgs_str = ' | '.join([o['full'] for o in orgs])
                lines.append(f"**Organizations:** {orgs_str}")
            
            lines.append("")
        
        # ============================================
        # SOURCE ANALYSIS
        # ============================================
        lines.append("## 📊 SOURCE ANALYSIS")
        lines.append("")
        
        tier1 = research.get('tier1_count', 0)
        tier2 = sources.__len__() - tier1 if sources else 0
        fact_check = research.get('fact_check_count', 0)
        official = research.get('official_count', 0)
        
        source_table = [
            "| Source Type | Count |",
            "|-------------|-------|",
            f"| Tier 1 (Reuters, AP, BBC, etc.) | {tier1} |",
            f"| Other sources | {tier2} |",
            f"| Fact-checkers | {fact_check} |",
            f"| Official (.gov) | {official} |"
        ]
        lines.extend(source_table)
        lines.append("")
        
        # ============================================
        # CONTEXT
        # ============================================
        if context:
            lines.append("## 📜 BACKGROUND")
            lines.append("")
            for entity, wiki_data in list(context.items())[:1]:
                extract = wiki_data.get('extract', '')[:200]
                if extract:
                    lines.append(f"**{entity}:** {extract}...")
            lines.append("")
        
        # ============================================
        # RELATED STORIES
        # ============================================
        if related_stories:
            lines.append("## 🔗 RELATED STORIES")
            lines.append("")
            for story in related_stories[:3]:
                lines.append(f"• [{story.get('country_name', 'World')}] {story.get('headline', '')[:60]}...")
            lines.append("")
        
        # ============================================
        # FOOTER
        # ============================================
        lines.append("---")
        lines.append(f"_Analysis generated {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M')} UTC by Xray v4_")
        
        return "\n".join(lines)
    
    def _generate_exec_summary(self, headline: str, summary: str, entities: Dict) -> str:
        """Generate executive summary"""
        
        # Build context-aware summary
        parts = []
        
        # Extract the key action/event
        headline_lower = headline.lower()
        
        # Action verbs
        actions = {
            'launches': 'has launched',
            'attacks': 'has attacked',
            'announces': 'has announced',
            'signs': 'has signed',
            'rejects': 'has rejected',
            'confirms': 'confirmed',
            'reports': 'reported',
            'says': 'stated'
        }
        
        # Get key entities
        countries = entities.get('countries', [])
        people = entities.get('people', [])
        orgs = entities.get('organizations', [])
        
        # Build summary
        if countries:
            country_names = [c['name'] for c in countries[:2]]
            parts.append(f"This story involves {' and '.join(country_names)}.")
        
        if people:
            person = people[0]
            parts.append(f"Key figure: {person['name']} ({person.get('role', 'official')}).")
        
        # Add headline essence
        parts.append(f"**{headline}**")
        
        return " ".join(parts)


if __name__ == '__main__':
    # Test the generator
    from research_engine import ResearchEngine
    
    generator = ProfessionalAnalysisGenerator()
    research_engine = ResearchEngine()
    
    test_headline = "Iran launches missile attack on Israel following general's assassination"
    test_summary = "Missiles fired from Iranian territory toward Tel Aviv, air defense systems activated"
    
    # Get research
    research = research_engine.research_story(test_headline, test_summary)
    
    # Generate analysis
    analysis = generator.generate_analysis(
        headline=test_headline,
        summary=test_summary,
        research=research
    )
    
    print("\n" + "="*60)
    print("GENERATED ANALYSIS")
    print("="*60)
    print(analysis)
