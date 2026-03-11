#!/usr/bin/env python3
"""
Professional Analysis Generator v7
Generates journalism-style narrative analysis from research data
Complete redesign for engaging, news-article format
"""

import re
import json
from datetime import datetime, timezone
from typing import Dict, List, Optional


class ProfessionalAnalysisGenerator:
    """Generate professional journalism-style analysis output"""
    
    def __init__(self):
        self.confidence_thresholds = {
            'high': 80,
            'medium': 60,
            'low': 40
        }
    
    # ==================== CORE PUBLIC METHOD ====================
    
    def generate_analysis(self, headline: str, summary: str, research: Dict,
                          related_stories: List[Dict] = None) -> str:
        """Generate journalism-style analysis - maintains same interface as v6"""
        
        entities = research.get('entities', {})
        sources = research.get('sources', [])
        
        # Extract and verify claims
        claims = self.extract_claims_from_text(headline, summary)
        claims = self.verify_claims(claims, sources)
        
        # Calculate confidence
        confidence = self.calculate_confidence(research, claims)
        
        # Build journalism-style sections
        sections = []
        
        # 1. Original Headline
        original_headline = self.generate_headline(headline, summary, entities, claims)
        sections.append(f"## {original_headline}")
        
        # 2. Lead Paragraph
        lead = self.generate_lead(headline, summary, entities, claims)
        sections.append(lead)
        
        # 3. The Situation
        situation = self.generate_situation(headline, summary, entities, claims, research)
        sections.append(f"**The Situation:** {situation}")
        
        # 4. Why It Matters
        why_matters = self.generate_why_it_matters(headline, summary, entities, research)
        sections.append(f"**Why It Matters:** {why_matters}")
        
        # 5. The Details
        details = self.generate_details_bullets(claims, entities, research)
        sections.append(details)
        
        # 6. What's Next
        whats_next = self.generate_whats_next(headline, entities, claims)
        sections.append(f"**What's Next:** {whats_next}")
        
        # 7. Confidence Score
        confidence_line = self._format_confidence_line(confidence, research)
        sections.append(confidence_line)
        
        # 8. Related Coverage (clearly separated)
        if related_stories:
            related = self._format_related_stories(related_stories)
            sections.append(related)
        
        return "\n\n".join(sections)
    
    # ==================== NARRATIVE GENERATION METHODS ====================
    
    def generate_headline(self, headline: str, summary: str, entities: Dict, claims: List[Dict]) -> str:
        """Create an original headline from story content"""
        
        # Extract key elements
        countries = [c.get('name', '') for c in entities.get('countries', [])[:2]]
        orgs = [o.get('name', '') for o in entities.get('organizations', [])[:1]]
        people = [p.get('name', '') for p in entities.get('people', [])[:1]]
        
        # Detect story type and generate appropriate headline
        headline_lower = headline.lower()
        summary_lower = summary.lower() if summary else ''
        
        # Conflict/War stories
        if any(w in headline_lower for w in ['war', 'attack', 'strike', 'missile', 'bomb', 'conflict', 'invasion']):
            if countries:
                return self._craft_conflict_headline(headline, countries, summary)
            return self._extract_action_headline(headline, 'Faces Escalating Conflict')
        
        # Political stories
        elif any(w in headline_lower for w in ['election', 'vote', 'president', 'minister', 'trump', 'biden', 'putin']):
            if people:
                return self._craft_political_headline(headline, people, countries, summary)
            return self._extract_action_headline(headline, 'Political Development Unfolds')
        
        # Economic stories
        elif any(w in headline_lower for w in ['economy', 'market', 'trade', 'tariff', 'sanction', 'inflation']):
            return self._craft_economic_headline(headline, countries, orgs, summary)
        
        # Disaster/Weather
        elif any(w in headline_lower for w in ['earthquake', 'flood', 'hurricane', 'fire', 'disaster', 'emergency']):
            return self._craft_disaster_headline(headline, countries, summary)
        
        # Sports/Events
        elif any(w in headline_lower for w in ['world cup', 'olympic', 'championship', 'tournament', 'fifa']):
            return self._craft_sports_headline(headline, countries, summary)
        
        # Default: Extract action and create headline
        return self._extract_action_headline(headline, 'Developing Story')
    
    def generate_lead(self, headline: str, summary: str, entities: Dict, claims: List[Dict]) -> str:
        """Write 2-3 sentence opening paragraph"""
        
        countries = [c.get('name', '') for c in entities.get('countries', [])[:3]]
        orgs = [o.get('name', '') for o in entities.get('organizations', [])[:1]]
        
        # Extract the most newsworthy claim
        top_claim = claims[0]['text'] if claims else headline
        
        # Build narrative lead
        lead_sentences = []
        
        # First sentence: What happened
        action_sentence = self._extract_action_sentence(top_claim, headline, summary)
        lead_sentences.append(action_sentence)
        
        # Second sentence: Context/implication
        if countries:
            context = f"The development involves {' and '.join(countries[:2])}"
            if len(countries) > 2:
                context += f", with potential regional implications"
            context += "."
            lead_sentences.append(context)
        elif orgs:
            lead_sentences.append(f"The situation involves {orgs[0]} and could have broader implications.")
        else:
            lead_sentences.append("The situation continues to develop as more details emerge.")
        
        return " ".join(lead_sentences)
    
    def generate_situation(self, headline: str, summary: str, entities: Dict, 
                           claims: List[Dict], research: Dict) -> str:
        """Provide context and background"""
        
        # Extract timeline context
        time_context = self._extract_time_context(headline, summary)
        
        # Build situation narrative
        situation_parts = []
        
        # What led to this
        if time_context:
            situation_parts.append(time_context)
        
        # Key entities involved
        countries = entities.get('countries', [])
        if countries:
            country_names = [c.get('name', '') for c in countries[:2]]
            situation_parts.append(f"This involves {' and '.join(country_names)}")
        
        # Current state based on verified claims
        verified = [c for c in claims if c.get('status') in ['confirmed', 'partially_confirmed']]
        if verified:
            situation_parts.append("with multiple sources confirming key details")
        else:
            situation_parts.append("though details are still being verified")
        
        situation = ". ".join(situation_parts) + "."
        return situation
    
    def generate_why_it_matters(self, headline: str, summary: str, entities: Dict, research: Dict) -> str:
        """Explain importance/implications"""
        
        headline_lower = headline.lower()
        
        # Detect impact type and generate relevance
        if any(w in headline_lower for w in ['war', 'attack', 'missile', 'strike', 'invasion']):
            return self._why_conflict_matters(entities, headline)
        
        elif any(w in headline_lower for w in ['election', 'vote', 'president']):
            return self._why_political_matters(entities, headline)
        
        elif any(w in headline_lower for w in ['economy', 'market', 'trade', 'tariff']):
            return self._why_economic_matters(entities, headline)
        
        elif any(w in headline_lower for w in ['world cup', 'olympic', 'fifa', 'championship']):
            return self._why_sports_matters(entities, headline)
        
        else:
            # Generic relevance
            countries = [c.get('name', '') for c in entities.get('countries', [])[:1]]
            if countries:
                return f"This development could influence regional dynamics and international relations involving {countries[0]}."
            return "This story is drawing attention from major news outlets and may develop further."
    
    def generate_details_bullets(self, claims: List[Dict], entities: Dict, research: Dict) -> str:
        """Generate 3-5 specific fact bullets"""
        
        bullets = []
        
        # From verified claims
        for claim in claims[:4]:
            claim_text = claim['text'].strip()
            if len(claim_text) > 15:
                # Clean up the claim text
                bullet = self._format_as_bullet(claim_text)
                bullets.append(bullet)
        
        # If not enough claims, add entity context
        if len(bullets) < 3:
            countries = entities.get('countries', [])
            if countries:
                country_list = ', '.join([c.get('name', '') for c in countries[:3]])
                bullets.append(f"Countries involved: {country_list}")
        
        if len(bullets) < 3:
            orgs = entities.get('organizations', [])
            if orgs:
                org_list = ', '.join([o.get('name', '') for o in orgs[:2]])
                bullets.append(f"Key organizations: {org_list}")
        
        # Format as bullet list
        if not bullets:
            bullets.append("Details are still emerging from sources")
        
        bullet_lines = [f"• {b.rstrip('.')}" for b in bullets[:5]]
        return "**The Details:**\n" + "\n".join(bullet_lines)
    
    def generate_whats_next(self, headline: str, entities: Dict, claims: List[Dict]) -> str:
        """What to watch for"""
        
        headline_lower = headline.lower()
        
        # Conflict stories
        if any(w in headline_lower for w in ['war', 'attack', 'strike', 'missile']):
            return self._whats_next_conflict(entities, headline)
        
        # Political stories
        elif any(w in headline_lower for w in ['election', 'vote', 'president', 'minister']):
            return self._whats_next_political(entities, headline)
        
        # Economic stories
        elif any(w in headline_lower for w in ['economy', 'market', 'trade', 'tariff']):
            return self._whats_next_economic(entities, headline)
        
        # Sports/Events
        elif any(w in headline_lower for w in ['world cup', 'olympic', 'fifa', 'championship']):
            return self._whats_next_sports(entities, headline)
        
        # Default
        else:
            return "Watch for official statements and further reporting from major outlets as the situation develops."
    
    # ==================== HELPER METHODS - HEADLINE CRAFTING ====================
    
    def _craft_conflict_headline(self, headline: str, countries: List[str], summary: str) -> str:
        """Craft headline for conflict stories"""
        
        if 'iran' in headline.lower() and 'us' in headline.lower():
            return "US-Iran Tensions Escalate Amid Regional Uncertainty"
        elif 'russia' in headline.lower() and 'ukraine' in headline.lower():
            return "Russia-Ukraine Conflict Enters New Phase"
        elif 'israel' in headline.lower():
            return "Israel Faces Regional Pressures as Situation Develops"
        elif len(countries) >= 2:
            return f"Tensions Rise Between {countries[0]} and {countries[1]}"
        else:
            return self._extract_action_headline(headline, 'Conflict Escalates')
    
    def _craft_political_headline(self, headline: str, people: List[str], countries: List[str], summary: str) -> str:
        """Craft headline for political stories"""
        
        if 'trump' in headline.lower():
            return "Trump Administration Faces New Political Challenge"
        elif 'election' in headline.lower():
            if countries:
                return f"{countries[0]} Election Draws International Attention"
            return "Election Results Shape Political Landscape"
        elif people:
            return f"{people[0]} at Center of Political Development"
        else:
            return self._extract_action_headline(headline, 'Political Shift Emerges')
    
    def _craft_economic_headline(self, headline: str, countries: List[str], orgs: List[str], summary: str) -> str:
        """Craft headline for economic stories"""
        
        if 'tariff' in headline.lower():
            return "Trade Tensions Resurface as Tariff Policies Shift"
        elif 'sanction' in headline.lower():
            return "New Sanctions Impact Global Economic Relations"
        elif countries:
            return f"{countries[0]} Economy Faces New Challenges"
        else:
            return self._extract_action_headline(headline, 'Economic Developments Unfold')
    
    def _craft_disaster_headline(self, headline: str, countries: List[str], summary: str) -> str:
        """Craft headline for disaster/weather stories"""
        
        if 'earthquake' in headline.lower():
            loc = countries[0] if countries else 'Region'
            return f"{loc} Hit by Earthquake, Emergency Response Underway"
        elif 'flood' in headline.lower():
            loc = countries[0] if countries else 'Region'
            return f"Severe Flooding Impacts {loc}"
        elif countries:
            return f"{countries[0]} Faces Emergency Situation"
        else:
            return self._extract_action_headline(headline, 'Emergency Response Underway')
    
    def _craft_sports_headline(self, headline: str, countries: List[str], summary: str) -> str:
        """Craft headline for sports/event stories"""
        
        if 'world cup' in headline.lower() or 'fifa' in headline.lower():
            return "FIFA World Cup Faces New Challenges"
        elif 'olympic' in headline.lower():
            return "Olympic Developments Draw Global Attention"
        elif countries:
            return f"Major Sporting Event Impacts {countries[0]}"
        else:
            return self._extract_action_headline(headline, 'Sports World Reacts')
    
    def _extract_action_headline(self, headline: str, fallback: str) -> str:
        """Extract action from headline and create new headline"""
        
        # Remove common prefixes
        cleaned = re.sub(r'^(BREAKING|UPDATE|LIVE|JUST IN):?\s*', '', headline, flags=re.IGNORECASE)
        
        # Extract key nouns/actions
        words = cleaned.split()[:8]
        if len(words) >= 3:
            # Try to make it sound like a headline
            return ' '.join(words).title()
        
        return fallback
    
    # ==================== HELPER METHODS - NARRATIVE BUILDING ====================
    
    def _extract_action_sentence(self, claim: str, headline: str, summary: str) -> str:
        """Extract or create the main action sentence"""
        
        # Clean up the claim
        claim = claim.strip().rstrip('.')
        
        # If it's a complete sentence, use it
        if len(claim) > 20 and not claim.lower().startswith(('a ', 'an ', 'the ')):
            return claim + "."
        
        # Otherwise build from headline
        headline_clean = re.sub(r'^(BREAKING|UPDATE|LIVE):?\s*', '', headline, flags=re.IGNORECASE)
        
        # Detect action verbs
        action_verbs = ['announces', 'launches', 'attacks', 'strikes', 'signs', 'rejects', 
                       'confirms', 'reports', 'warns', 'threatens', 'calls', 'faces']
        
        for verb in action_verbs:
            if verb in headline_clean.lower():
                return f"{headline_clean}."
        
        # Default
        return f"{headline_clean}, according to emerging reports."
    
    def _extract_time_context(self, headline: str, summary: str) -> str:
        """Extract temporal context"""
        
        combined = f"{headline} {summary}".lower()
        
        if 'today' in combined:
            return "Today's developments mark a significant moment"
        elif 'yesterday' in combined:
            return "Following yesterday's events"
        elif 'this week' in combined:
            return "This week's developments"
        elif 'breaking' in combined:
            return "Breaking news indicates"
        elif 'live' in combined:
            return "Live reports indicate"
        
        return "Recent developments show"
    
    def _format_as_bullet(self, text: str) -> str:
        """Format claim text as a clean bullet point"""
        
        # Remove trailing punctuation
        text = text.strip().rstrip('.')
        
        # Capitalize first letter
        if text:
            text = text[0].upper() + text[1:]
        
        return text
    
    # ==================== HELPER METHODS - WHY IT MATTERS ====================
    
    def _why_conflict_matters(self, entities: Dict, headline: str) -> str:
        """Why conflict stories matter"""
        
        countries = [c.get('name', '') for c in entities.get('countries', [])[:2]]
        
        if 'iran' in headline.lower() and 'us' in headline.lower():
            return "The US-Iran relationship affects global oil markets, regional alliances, and international security frameworks."
        elif 'russia' in headline.lower():
            return "Russia's actions have profound implications for European security, NATO unity, and global geopolitical stability."
        elif len(countries) >= 2:
            return f"The {countries[0]}-{countries[1]} dynamic could reshape regional power balances and international responses."
        
        return "Military and security developments in this region often have cascading effects on global stability and markets."
    
    def _why_political_matters(self, entities: Dict, headline: str) -> str:
        """Why political stories matter"""
        
        if 'trump' in headline.lower():
            return "Trump administration policies affect domestic politics, international trade relationships, and global diplomatic norms."
        elif 'election' in headline.lower():
            return "Election outcomes determine policy directions, international alliances, and economic frameworks for years to come."
        
        return "Political shifts in major powers influence global governance, trade relationships, and security arrangements."
    
    def _why_economic_matters(self, entities: Dict, headline: str) -> str:
        """Why economic stories matter"""
        
        if 'tariff' in headline.lower() or 'trade' in headline.lower():
            return "Trade policy changes affect consumer prices, supply chains, and international business relationships globally."
        elif 'sanction' in headline.lower():
            return "Sanctions impact global markets, energy prices, and the effectiveness of international diplomatic pressure."
        
        return "Economic developments affect market stability, investment flows, and consumer confidence worldwide."
    
    def _why_sports_matters(self, entities: Dict, headline: str) -> str:
        """Why sports/event stories matter"""
        
        if 'world cup' in headline.lower() or 'fifa' in headline.lower():
            return "The World Cup brings geopolitical considerations into sports, affecting host nations, participating countries, and global audiences."
        
        return "Major sporting events often intersect with politics, economics, and international relations in unexpected ways."
    
    # ==================== HELPER METHODS - WHAT'S NEXT ====================
    
    def _whats_next_conflict(self, entities: Dict, headline: str) -> str:
        """What's next for conflict stories"""
        
        countries = [c.get('name', '') for c in entities.get('countries', [])[:1]]
        
        if 'iran' in headline.lower():
            return "Watch for official statements from Washington and Tehran, along with any UN Security Council responses."
        elif 'russia' in headline.lower():
            return "Monitor NATO statements, Ukrainian government announcements, and any shifts in Western military support."
        
        return "Expect further statements from involved parties and watch for international diplomatic responses."
    
    def _whats_next_political(self, entities: Dict, headline: str) -> str:
        """What's next for political stories"""
        
        if 'election' in headline.lower():
            return "Watch for certification deadlines, legal challenges, and transition preparations as the process unfolds."
        
        return "Expect further statements from officials and watch for policy announcements in the coming days."
    
    def _whats_next_economic(self, entities: Dict, headline: str) -> str:
        """What's next for economic stories"""
        
        if 'tariff' in headline.lower():
            return "Watch for trading partner responses, market reactions, and any WTO-related developments."
        
        return "Monitor market reactions and any follow-up policy announcements from relevant authorities."
    
    def _whats_next_sports(self, entities: Dict, headline: str) -> str:
        """What's next for sports stories"""
        
        if 'world cup' in headline.lower() or 'fifa' in headline.lower():
            return "FIFA is expected to address the situation in upcoming meetings. Watch for official statements on participation policies and contingency planning."
        
        return "Expect official statements from governing bodies and watch for schedule or policy adjustments."
    
    # ==================== EXISTING HELPER FUNCTIONS (PRESERVED) ====================
    
    def calculate_confidence(self, research: Dict, claims: List[Dict]) -> int:
        """Calculate overall confidence score (0-100) - UNCHANGED from v6"""
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
        """Extract verifiable claims from the CURRENT STORY ONLY - UNCHANGED from v6"""
        claims = []
        # Only use headline and summary from THIS story - no external content
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
                          'putin', 'zelenskyy', 'netanyahu', 'nato', 'un', 'eu', 'fifa', 'world cup']
            for word in entity_words:
                if word in sentence.lower():
                    worthiness += 2
                    break
            
            # Contains verification-worthy verbs
            verify_verbs = ['announced', 'confirmed', 'reported', 'stated', 'said', 'launched',
                          'attacked', 'signed', 'agreed', 'rejected', 'approved', 'faces', 'warns']
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
        """Verify claims against found sources - UNCHANGED from v6"""
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
    
    # ==================== FORMATTING HELPERS ====================
    
    def _format_confidence_line(self, confidence: int, research: Dict) -> str:
        """Format the confidence score line"""
        
        tier1 = research.get('tier1_count', 0)
        fact_check = research.get('fact_check_count', 0)
        official = research.get('official_count', 0)
        
        source_parts = []
        if tier1 > 0:
            source_parts.append(f"{tier1} major outlet{'s' if tier1 > 1 else ''}")
        if official > 0:
            source_parts.append(f"{official} official source{'s' if official > 1 else ''}")
        if fact_check > 0:
            source_parts.append(f"{fact_check} fact-check{'s' if fact_check > 1 else ''}")
        
        if source_parts:
            source_text = ", ".join(source_parts)
            return f"**Confidence: {confidence}%** — Based on {source_text}."
        else:
            return f"**Confidence: {confidence}%** — Based on available reporting."
    
    def _format_related_stories(self, related_stories: List[Dict]) -> str:
        """Format related stories section - clearly separated"""
        
        lines = ["---", "**Related Coverage:**"]
        
        for story in related_stories[:4]:
            country = story.get('country_name', 'World')
            headline = story.get('headline', '')
            
            # Don't truncate - either show full headline or skip if too long
            if len(headline) > 120:
                # Find a good break point
                headline = headline[:100].rsplit(' ', 1)[0] + "..."
            
            lines.append(f"• [{country}] {headline}")
        
        return "\n".join(lines)


# ==================== BACKWARD COMPATIBILITY ====================
# Maintain same interface for existing code

def generate_analysis(headline: str, summary: str, research: Dict,
                      related_stories: List[Dict] = None) -> str:
    """Module-level function for backward compatibility"""
    generator = ProfessionalAnalysisGenerator()
    return generator.generate_analysis(headline, summary, research, related_stories)


if __name__ == "__main__":
    # Test with sample data
    test_research = {
        'entities': {
            'countries': [{'name': 'United States'}, {'name': 'Iran'}],
            'organizations': [{'name': 'FIFA'}],
            'people': []
        },
        'sources': [
            {'title': 'BBC News', 'snippet': 'World Cup faces challenges', 'tier': 1},
            {'title': 'Reuters', 'snippet': 'Visa restrictions considered', 'tier': 1}
        ],
        'source_count': 10,
        'tier1_count': 2,
        'fact_check_count': 1,
        'official_count': 1
    }
    
    test_related = [
        {'country_name': 'Mexico', 'headline': 'Mexico security concerns rise ahead of World Cup'},
        {'country_name': 'Iraq', 'headline': 'Iraq qualifying matches face uncertainty'}
    ]
    
    generator = ProfessionalAnalysisGenerator()
    analysis = generator.generate_analysis(
        "FIFA World Cup: US war on Iran, Mexico violence, visa bans, Iraq qualifier",
        "The 2026 FIFA World Cup faces geopolitical challenges as US-Iran conflict escalates.",
        test_research,
        test_related
    )
    
    print(analysis)
    print("\n" + "="*50 + "\n")
    print("v7 Analysis Generator - Journalism Style")
