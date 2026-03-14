#!/usr/bin/env python3
"""
Professional Analysis Generator v8
Human-like, engaging journalism that readers want to read
"""

import re
import json
from datetime import datetime, timezone
from typing import Dict, List, Optional


class ProfessionalAnalysisGenerator:
    """Generate human-like, engaging analysis that reads like real journalism"""
    
    def __init__(self):
        self.confidence_thresholds = {
            'high': 80,
            'medium': 60,
            'low': 40
        }
    
    # Known political figures and their countries
    POLITICAL_FIGURES = {
        # Canada
        'mark carney': {'name': 'Mark Carney', 'role': 'Prime Minister of Canada', 'country': 'CA', 'country_name': 'Canada'},
        'justin trudeau': {'name': 'Justin Trudeau', 'role': 'former Prime Minister', 'country': 'CA', 'country_name': 'Canada'},
        'trudeau': {'name': 'Justin Trudeau', 'role': 'former Prime Minister', 'country': 'CA', 'country_name': 'Canada'},
        'pierre poilievre': {'name': 'Pierre Poilievre', 'role': 'Conservative Leader', 'country': 'CA', 'country_name': 'Canada'},
        'poilievre': {'name': 'Pierre Poilievre', 'role': 'Conservative Leader', 'country': 'CA', 'country_name': 'Canada'},
        'doug ford': {'name': 'Doug Ford', 'role': 'Ontario Premier', 'country': 'CA', 'country_name': 'Canada'},
        'wab kinew': {'name': 'Wab Kinew', 'role': 'Manitoba Premier', 'country': 'CA', 'country_name': 'Canada'},
        # US
        'trump': {'name': 'Donald Trump', 'role': 'US President', 'country': 'US', 'country_name': 'United States'},
        'donald trump': {'name': 'Donald Trump', 'role': 'US President', 'country': 'US', 'country_name': 'United States'},
        'biden': {'name': 'Joe Biden', 'role': 'US President', 'country': 'US', 'country_name': 'United States'},
        # UK
        'keir starmer': {'name': 'Keir Starmer', 'role': 'Prime Minister', 'country': 'GB', 'country_name': 'United Kingdom'},
        'starmer': {'name': 'Keir Starmer', 'role': 'Prime Minister', 'country': 'GB', 'country_name': 'United Kingdom'},
        # Germany
        'friedrich merz': {'name': 'Friedrich Merz', 'role': 'Chancellor', 'country': 'DE', 'country_name': 'Germany'},
        'merz': {'name': 'Friedrich Merz', 'role': 'Chancellor', 'country': 'DE', 'country_name': 'Germany'},
        'scholz': {'name': 'Olaf Scholz', 'role': 'Chancellor', 'country': 'DE', 'country_name': 'Germany'},
        # Russia/Ukraine
        'putin': {'name': 'Vladimir Putin', 'role': 'President', 'country': 'RU', 'country_name': 'Russia'},
        'zelenskyy': {'name': 'Volodymyr Zelenskyy', 'role': 'President', 'country': 'UA', 'country_name': 'Ukraine'},
        'zelensky': {'name': 'Volodymyr Zelenskyy', 'role': 'President', 'country': 'UA', 'country_name': 'Ukraine'},
        # Middle East
        'netanyahu': {'name': 'Benjamin Netanyahu', 'role': 'Prime Minister', 'country': 'IL', 'country_name': 'Israel'},
        'khamenei': {'name': 'Ali Khamenei', 'role': 'Supreme Leader', 'country': 'IR', 'country_name': 'Iran'},
    }
    
    def generate_analysis(self, headline: str, summary: str, research: Dict,
                          related_stories: List[Dict] = None) -> str:
        """Generate engaging, human-like analysis"""
        
        # Clean inputs - remove HTML/image tags
        headline = self._clean_text(headline)
        summary = self._clean_text(summary)
        
        entities = research.get('entities', {})
        sources = research.get('sources', [])
        
        # Extract and verify claims
        claims = self.extract_claims_from_text(headline, summary)
        claims = self.verify_claims(claims, sources)
        
        # Calculate confidence
        confidence = self.calculate_confidence(research, claims)
        
        # Detect story type and context
        story_context = self._detect_story_context(headline, summary, entities)
        
        # Build engaging analysis
        sections = []
        
        # 1. Short Summary (2-3 sentences max)
        short_summary = self._write_short_summary(headline, summary, story_context, entities)
        sections.append(short_summary)
        
        # 2. Key Points (3-4 bullets max)
        key_points = self._write_key_points(headline, summary, claims, entities, story_context)
        sections.append(key_points)
        
        # 3. Context (1-2 sentences)
        context = self._write_context(headline, summary, entities, story_context)
        if context:
            sections.append(context)
        
        # 4. Why It Matters (engaging, specific)
        why_matters = self._write_why_it_matters(headline, summary, entities, story_context)
        sections.append(why_matters)
        
        # 5. Confidence line
        confidence_line = self._format_confidence_line(confidence, research)
        sections.append(confidence_line)
        
        # 6. Related stories (if any)
        if related_stories:
            related = self._format_related_stories(related_stories)
            sections.append(related)
        
        return "\n\n".join(sections)
    
    def _clean_text(self, text: str) -> str:
        """Remove HTML tags, image references, clean up text"""
        if not text:
            return ""
        
        # Remove HTML tags
        text = re.sub(r'<[^>]+>', '', text)
        
        # Remove image URLs
        text = re.sub(r'https?://[^\s]+\.(jpg|jpeg|png|gif|webp)', '', text, flags=re.IGNORECASE)
        
        # Remove Reddit-style image previews
        text = re.sub(r'external-preview\.redd\.it[^\s]*', '', text)
        
        # Clean up whitespace
        text = re.sub(r'\s+', ' ', text)
        
        return text.strip()
    
    def _detect_story_context(self, headline: str, summary: str, entities: Dict) -> Dict:
        """Detect story type, key figures, and context"""
        combined = f"{headline} {summary}".lower()
        
        context = {
            'type': 'general',
            'key_figure': None,
            'country': None,
            'is_political': False,
            'is_canadian': False
        }
        
        # Check for known political figures
        for key, data in self.POLITICAL_FIGURES.items():
            if key in combined:
                context['key_figure'] = data
                context['country'] = data.get('country_name')
                context['is_political'] = True
                if data.get('country') == 'CA':
                    context['is_canadian'] = True
                break
        
        # Detect Canadian content
        canadian_markers = ['canada', 'canadian', 'ottawa', 'toronto', 'vancouver', 'montreal',
                          'alberta', 'ontario', 'quebec', 'bc', 'manitoba', 'saskatchewan',
                          'prime minister', 'premier', 'mp ', 'liberal party', 'conservative party',
                          'ndp', 'parliament', 'parliament hill']
        
        for marker in canadian_markers:
            if marker in combined:
                context['is_canadian'] = True
                if not context['country']:
                    context['country'] = 'Canada'
                break
        
        # Detect story type
        if any(w in combined for w in ['election', 'vote', 'poll', 'campaign']):
            context['type'] = 'election'
        elif any(w in combined for w in ['war', 'attack', 'strike', 'missile', 'invasion']):
            context['type'] = 'conflict'
        elif any(w in combined for w in ['economy', 'market', 'trade', 'tariff', 'budget']):
            context['type'] = 'economic'
        elif context['is_political']:
            context['type'] = 'political'
        
        return context
    
    def _write_short_summary(self, headline: str, summary: str, context: Dict, entities: Dict) -> str:
        """Write a 2-3 sentence engaging summary"""
        
        key_figure = context.get('key_figure')
        
        # Political story with known figure
        if key_figure:
            name = key_figure.get('name', '')
            role = key_figure.get('role', '')
            country = key_figure.get('country_name', '')
            
            if 'prime minister' in role.lower() and 'canada' in country.lower():
                # Extract the key news from headline
                if 'spoke to' in headline.lower() or 'sources' in headline.lower():
                    return f"A deep-dive into {name}'s first year as Prime Minister reveals insights from dozens of sources close to the government. The picture that emerges sheds light on how Canada's leader is navigating an increasingly complex political landscape."
                elif 'year' in headline.lower():
                    return f"New reporting examines {name}'s performance as {role} through interviews with key insiders. The findings offer a rare glimpse into the challenges and priorities shaping {country}'s current government."
                else:
                    return f"{name}, {role}, is at the center of growing attention as new details emerge about their leadership. The developments could have significant implications for {country}'s political direction."
        
        # Generic but engaging summary
        # Extract action from headline
        action = self._extract_action(headline)
        
        if summary and len(summary) > 50:
            # Use summary but make it engaging
            clean_summary = self._clean_text(summary)
            # Take first 150 chars and make it flow
            if len(clean_summary) > 150:
                clean_summary = clean_summary[:150].rsplit(' ', 1)[0]
            return f"{clean_summary}. The story is drawing attention as details continue to unfold."
        
        return f"{action}. This developing story is being closely watched by observers."
    
    def _write_key_points(self, headline: str, summary: str, claims: List[Dict], 
                          entities: Dict, context: Dict) -> str:
        """Write 3-4 key points as bullets"""
        
        bullets = []
        
        # Start with the main news
        key_figure = context.get('key_figure')
        
        if key_figure:
            name = key_figure.get('name', '')
            role = key_figure.get('role', '')
            bullets.append(f"{name} serves as {role}")
        
        # Add verified claims as points
        for claim in claims[:3]:
            claim_text = self._clean_text(claim.get('text', ''))
            if claim_text and len(claim_text) > 20:
                # Make it engaging, not robotic
                bullet = self._make_claim_engaging(claim_text)
                if bullet and bullet not in bullets:
                    bullets.append(bullet)
        
        # Add entity context if needed
        if len(bullets) < 2:
            countries = entities.get('countries', [])
            if countries:
                country_names = [c.get('name', '') for c in countries[:2]]
                bullets.append(f"Involves: {' and '.join(country_names)}")
        
        # Ensure we have at least 2 bullets
        if len(bullets) < 2:
            if 'year' in headline.lower():
                bullets.append("Examines first-year performance and challenges")
            if 'sources' in headline.lower():
                bullets.append("Based on extensive interviews with insiders")
        
        # Format
        if not bullets:
            bullets.append("Story details are still emerging")
        
        bullet_lines = [f"• {b}" for b in bullets[:4]]
        return "**Key Points:**\n" + "\n".join(bullet_lines)
    
    def _make_claim_engaging(self, claim: str) -> str:
        """Transform a claim into an engaging bullet point"""
        
        # Remove robotic starters
        claim = re.sub(r'^(This|The|A|An)\s+(story|report|article)\s+', '', claim, flags=re.IGNORECASE)
        
        # Make it concise
        if len(claim) > 100:
            claim = claim[:100].rsplit(' ', 1)[0]
        
        # Capitalize properly
        claim = claim.strip()
        if claim:
            claim = claim[0].upper() + claim[1:]
        
        return claim.rstrip('.')
    
    def _write_context(self, headline: str, summary: str, entities: Dict, context: Dict) -> str:
        """Write 1-2 sentences of context"""
        
        key_figure = context.get('key_figure')
        
        if key_figure:
            name = key_figure.get('name', '')
            country = key_figure.get('country_name', '')
            
            if context.get('is_canadian'):
                return f"**Background:** {name} leads a Liberal government navigating economic pressures and shifting public opinion in {country}."
            return f"**Background:** {name} has been a central figure in {country}'s recent political developments."
        
        return ""
    
    def _write_why_it_matters(self, headline: str, summary: str, entities: Dict, context: Dict) -> str:
        """Write why this story matters - make it specific, not generic"""
        
        key_figure = context.get('key_figure')
        story_type = context.get('type', 'general')
        
        # Canadian political story
        if context.get('is_canadian') and story_type == 'political':
            if key_figure and 'prime minister' in key_figure.get('role', '').lower():
                return "**Why It Matters:** Canada's political direction affects trade relationships with the US, climate policy, and immigration — issues that resonate beyond its borders."
            return "**Why It Matters:** Canadian politics often sets precedents for social and economic policies watched by other Western nations."
        
        # US political story
        if key_figure and key_figure.get('country') == 'US':
            return "**Why It Matters:** US policy shifts ripple through global markets, alliances, and international agreements."
        
        # Conflict story
        if story_type == 'conflict':
            return "**Why It Matters:** Military developments in this region can affect global energy markets, refugee flows, and international security arrangements."
        
        # Economic story
        if story_type == 'economic':
            return "**Why It Matters:** Economic policy changes affect trade partnerships, consumer prices, and investment flows across borders."
        
        # Generic but better
        return "**Why It Matters:** This story is being covered by major outlets and could develop further as more information becomes available."
    
    def _extract_action(self, headline: str) -> str:
        """Extract the main action from a headline"""
        
        # Remove common prefixes
        cleaned = re.sub(r'^(BREAKING|UPDATE|LIVE|JUST IN):?\s*', '', headline, flags=re.IGNORECASE)
        
        # Clean it up
        cleaned = self._clean_text(cleaned)
        
        return cleaned
    
    # ==================== PRESERVED METHODS ====================
    
    def calculate_confidence(self, research: Dict, claims: List[Dict]) -> int:
        """Calculate overall confidence score"""
        score = 30  # Base
        
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
        
        if research.get('fact_check_count', 0) > 0:
            score += 10
        
        if research.get('official_count', 0) > 0:
            score += 10
        
        verified_claims = sum(1 for c in claims if c.get('verified', False))
        if verified_claims > 0:
            score += min(verified_claims * 5, 15)
        
        return min(score, 100)
    
    def extract_claims_from_text(self, headline: str, summary: str = '') -> List[Dict]:
        """Extract verifiable claims from the story"""
        claims = []
        combined = f"{headline}. {summary}" if summary else headline
        
        # Clean first
        combined = self._clean_text(combined)
        
        # Split into sentences
        sentences = re.split(r'(?<=[.!?])\s+', combined)
        
        for sentence in sentences:
            sentence = sentence.strip()
            if len(sentence) < 20:
                continue
            
            worthiness = 0
            
            if re.search(r'\d+', sentence):
                worthiness += 2
            
            entity_words = ['iran', 'israel', 'russia', 'ukraine', 'china', 'us', 'trump', 'biden',
                          'putin', 'zelenskyy', 'netanyahu', 'nato', 'un', 'eu', 'canada', 'carney',
                          'trudeau', 'premier', 'minister', 'prime minister']
            for word in entity_words:
                if word in sentence.lower():
                    worthiness += 2
                    break
            
            verify_verbs = ['announced', 'confirmed', 'reported', 'stated', 'said', 'launched',
                          'attacked', 'signed', 'agreed', 'rejected', 'approved', 'faces', 'warns',
                          'spoke', 'emerged']
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
        
        claims.sort(key=lambda x: x['worthiness'], reverse=True)
        return claims[:5]
    
    def verify_claims(self, claims: List[Dict], sources: List[Dict]) -> List[Dict]:
        """Verify claims against found sources"""
        for claim in claims:
            claim_text = claim['text'].lower()
            
            supporting = []
            
            for source in sources:
                snippet = source.get('snippet', '').lower()
                title = source.get('title', '').lower()
                combined = f"{title} {snippet}"
                
                claim_words = set(claim_text.split())
                source_words = set(combined.split())
                overlap = claim_words & source_words
                
                if len(overlap) >= 3:
                    if source.get('tier', 4) <= 2:
                        supporting.append(source)
            
            if len(supporting) >= 2:
                claim['verified'] = True
                claim['status'] = 'confirmed'
                claim['sources'] = len(supporting)
            elif len(supporting) == 1:
                claim['verified'] = True
                claim['status'] = 'partially_confirmed'
                claim['sources'] = 1
            else:
                claim['verified'] = False
                claim['status'] = 'unverified'
        
        return claims
    
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
        """Format related stories section"""
        
        lines = ["---", "**Related Coverage:**"]
        
        for story in related_stories[:4]:
            country = story.get('country_name', 'World')
            headline = story.get('headline', '')
            
            if len(headline) > 100:
                headline = headline[:100].rsplit(' ', 1)[0] + "..."
            
            lines.append(f"• [{country}] {headline}")
        
        return "\n".join(lines)


def generate_analysis(headline: str, summary: str, research: Dict,
                      related_stories: List[Dict] = None) -> str:
    """Module-level function for backward compatibility"""
    generator = ProfessionalAnalysisGenerator()
    return generator.generate_analysis(headline, summary, research, related_stories)


if __name__ == "__main__":
    # Test with Mark Carney story
    test_research = {
        'entities': {
            'countries': [{'name': 'Canada', 'code': 'CA'}],
            'organizations': [],
            'people': [{'name': 'Mark Carney', 'role': 'Prime Minister'}]
        },
        'sources': [
            {'title': 'CBC News', 'snippet': 'Mark Carney first year as PM', 'tier': 1},
            {'title': 'Reuters', 'snippet': 'Canadian politics analysis', 'tier': 1}
        ],
        'source_count': 8,
        'tier1_count': 2,
        'fact_check_count': 1,
        'official_count': 0
    }
    
    generator = ProfessionalAnalysisGenerator()
    analysis = generator.generate_analysis(
        "I spoke to over 30 sources about Mark Carney's first year as prime minister. This is the picture that emerged",
        "A deep look at the Prime Minister's first year in office through interviews with insiders.",
        test_research
    )
    
    print("=== V8 Analysis Generator Test ===")
    print(analysis)
