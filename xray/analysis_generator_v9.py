#!/usr/bin/env python3
"""
Narrative Analysis Generator v9
Flowing journalism that reads like professional long-form reporting
"""

import re
import random
from dataclasses import dataclass, field
from typing import Dict, List, Optional
from datetime import datetime, timezone


@dataclass
class StoryContext:
    """Context for story composition"""
    story_type: str = 'general'
    key_figure: Optional[Dict] = None
    secondary_figure: Optional[Dict] = None
    country: Optional[str] = None
    country_code: Optional[str] = None
    is_political: bool = False
    is_canadian: bool = False
    is_breaking: bool = False
    urgency: str = 'normal'


@dataclass
class VoiceProfile:
    """Voice/tone profile for different story types"""
    name: str
    sentence_style: str
    transition_preference: str
    closing_style: str
    preferred_connectors: List[str] = field(default_factory=list)


TRANSITIONS = {
    'addition': ["Meanwhile,", "At the same time,", "Beyond that,", "Further,", "Additionally,"],
    'contrast': ["But", "Yet", "However,", "On the other hand,", "Still,"],
    'cause': ["This comes as", "Against this backdrop,", "The move follows", "In response,", "As a result,"],
    'sequence': ["Since then,", "Earlier,", "Previously,", "Hours earlier,", "Just days ago,"],
    'emphasis': ["Crucially,", "Importantly,", "Significantly,", "Most notably,", "Key details indicate"],
    'conclusion': ["Looking ahead,", "As this develops,", "The coming days will show", "What remains to be seen is", "The question now is"],
    'evidence': ["According to", "Reporting from", "Sources indicate", "Officials say", "Documents show"],
    'context': ["Historically,", "For context,", "To understand this,", "This marks", "Against a backdrop of"]
}


VOICE_PROFILES = {
    'breaking': VoiceProfile('breaking', 'urgent', 'direct', 'forward-looking', TRANSITIONS['emphasis'] + TRANSITIONS['sequence']),
    'feature': VoiceProfile('feature', 'measured', 'smooth', 'contemplative', TRANSITIONS['addition'] + TRANSITIONS['context']),
    'political': VoiceProfile('political', 'measured', 'smooth', 'forward-looking', TRANSITIONS['cause'] + TRANSITIONS['contrast']),
    'conflict': VoiceProfile('conflict', 'punchy', 'dramatic', 'action-oriented', TRANSITIONS['emphasis'] + TRANSITIONS['sequence']),
    'economic': VoiceProfile('economic', 'measured', 'smooth', 'forward-looking', TRANSITIONS['cause'] + TRANSITIONS['evidence']),
    'general': VoiceProfile('general', 'measured', 'smooth', 'forward-looking', TRANSITIONS['addition'] + TRANSITIONS['conclusion'])
}


class NarrativeAnalysisGenerator:
    """Generate flowing narrative journalism that engages readers"""
    
    def __init__(self):
        self.confidence_thresholds = {'high': 80, 'medium': 60, 'low': 40}
    
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
        """Generate 4-6 paragraph narrative analysis"""
        
        headline = self._clean_text(headline)
        summary = self._clean_text(summary)
        entities = research.get('entities', {})
        sources = research.get('sources', [])
        
        claims = self.extract_claims_from_text(headline, summary)
        claims = self.verify_claims(claims, sources)
        confidence = self.calculate_confidence(research, claims)
        context = self._build_story_context(headline, summary, entities)
        voice = VOICE_PROFILES.get(context.story_type, VOICE_PROFILES['general'])
        
        paragraphs = []
        paragraphs.append(self._compose_lead_paragraph(headline, summary, context, voice))
        paragraphs.append(self._compose_nut_graph(headline, summary, context, voice))
        
        evidence = self._compose_evidence_paragraph(headline, summary, claims, sources, context, voice)
        if evidence:
            paragraphs.append(evidence)
        
        context_para = self._compose_context_paragraph(headline, summary, context, voice)
        if context_para:
            paragraphs.append(context_para)
        
        paragraphs.append(self._compose_closing_paragraph(headline, summary, context, voice, confidence))
        
        if related_stories:
            paragraphs.append(self._format_related_stories(related_stories))
        
        return "\n\n".join(paragraphs)
    
    def _compose_lead_paragraph(self, headline: str, summary: str, 
                                 context: StoryContext, voice: VoiceProfile) -> str:
        """Hook the reader with most newsworthy element - 25-40 words"""
        
        key_figure = context.key_figure
        secondary = context.secondary_figure
        combined = f"{headline} {summary}".lower()
        
        # Dual-figure story
        if key_figure and secondary:
            name1 = key_figure.get('name', '')
            name2 = secondary.get('name', '')
            
            if context.story_type == 'conflict':
                if 'UA' in [key_figure.get('country'), secondary.get('country')]:
                    return f"{name1} and {name2} have spoken directly about the war, a conversation that could reshape the trajectory of the conflict and Western support for Kyiv."
            return f"A direct conversation between {name1} and {name2} is drawing attention, with implications that could ripple across diplomatic circles."
        
        if key_figure:
            name = key_figure.get('name', '')
            role = key_figure.get('role', '')
            country = key_figure.get('country_name', '')
            
            if context.story_type == 'conflict':
                if context.country_code == 'UA':
                    return f"Ukraine's President Volodymyr Zelenskyy faces a pivotal moment as new developments reshape battlefield dynamics and Western support. The stakes couldn't be higher."
                elif context.country_code == 'RU':
                    return f"Vladimir Putin's latest moves draw sharp international attention as Russia's trajectory shifts amid ongoing pressures. What happens next matters."
            
            if context.story_type == 'political':
                if 'year' in combined or 'anniversary' in combined:
                    return f"New reporting reveals the inside story of {name}'s leadership, drawn from dozens of sources who've watched the {role} navigate an increasingly complex landscape."
                elif 'sources' in combined or 'spoke to' in combined:
                    return f"Behind the headlines, a clearer picture of {name}'s approach emerges through extensive interviews with those closest to the {role}."
                return f"{name}, {role}, is at the center of developments that could reshape {country}'s trajectory in the months ahead."
        
        if context.is_breaking or context.urgency == 'urgent':
            action = self._extract_core_news(headline)
            return f"Breaking: {action} Details are still emerging."
        
        action = self._extract_core_news(headline)
        if context.country and context.country != 'World':
            return f"From {context.country}, {action}"
        return action
    
    def _extract_core_news(self, headline: str) -> str:
        cleaned = re.sub(r'^(BREAKING|UPDATE|LIVE|JUST IN):?\s*', '', headline, flags=re.IGNORECASE)
        cleaned = self._clean_text(cleaned)
        if len(cleaned) > 120:
            cleaned = cleaned[:120].rsplit(' ', 1)[0]
        return cleaned
    
    def _compose_nut_graph(self, headline: str, summary: str,
                           context: StoryContext, voice: VoiceProfile) -> str:
        """Explain significance - 1-3 sentences weaving why it matters"""
        
        key_figure = context.key_figure
        country_code = key_figure.get('country', '') if key_figure else None
        combined = f"{headline} {summary}".lower()
        
        if country_code == 'US':
            if 'ukraine' in combined or 'zelensky' in combined:
                return "US policy on Ukraine has been the backbone of Western resistance to Russian aggression. Any shift ripples through European security, NATO unity, and the global balance of power."
            if 'russia' in combined or 'putin' in combined:
                return "Washington's approach to Moscow affects everything from nuclear stability to energy markets. The relationship between these powers shapes the international order."
            if 'iran' in combined:
                return "US-Iran relations influence nuclear non-proliferation efforts, Middle East stability, and global oil supplies. The consequences extend far beyond the region."
            if 'china' in combined:
                return "The US-China relationship defines global trade, technology competition, and security in the Indo-Pacific. How this evolves matters to everyone."
            return "US policy decisions cascade through global markets, alliances, and international agreements. What Washington does next matters."
        
        if country_code == 'CA':
            return "Canada's political direction shapes trade relationships with the US, climate policy commitments, and immigration flows. These decisions resonate beyond Canadian borders."
        if country_code == 'GB':
            return "UK policy affects transatlantic trade, European financial markets, and the post-Brexit global order. London's choices matter to its allies and partners."
        if country_code == 'UA' or 'ukraine' in combined:
            return "The war in Ukraine has redrawn Europe's security map, displaced millions, and triggered sanctions that ripple through energy and food markets worldwide."
        if country_code == 'RU' or 'russia' in combined:
            return "Russia's actions affect global energy supplies, nuclear deterrence, and the international framework built after World War II. The world is watching."
        if context.story_type == 'conflict':
            return "Military developments in this region can shift energy markets, trigger refugee flows, and redraw alliances. The humanitarian stakes are equally high."
        if context.story_type == 'economic':
            return "Economic policy changes affect trade partnerships, consumer prices, and investment flows across borders. Markets and workers alike feel the impact."
        return "This story is being closely watched. Further developments could shape the broader picture in significant ways."
    
    def _compose_evidence_paragraph(self, headline: str, summary: str,
                                     claims: List[Dict], sources: List[Dict],
                                     context: StoryContext, voice: VoiceProfile) -> str:
        """Weave facts into narrative sentences using actual summary and sources"""
        
        sentences = []
        
        # Use summary as narrative base
        if summary and len(summary) > 30:
            narrative = self._transform_to_narrative(summary, context)
            if narrative:
                sentences.append(narrative)
        
        # Add source corroboration
        tier1_sources = [s for s in sources if s.get('tier', 4) <= 2]
        if tier1_sources:
            outlet_names = []
            for s in tier1_sources[:3]:
                title = s.get('title', '')
                outlet_names.append(title.split()[0] if ' ' in title else title)
            
            if len(outlet_names) >= 2:
                # Get content from source snippets
                snippets = [s.get('snippet', '') for s in tier1_sources[:2] if s.get('snippet')]
                connector = random.choice(TRANSITIONS['evidence'])
                
                if len(outlet_names) == 2:
                    outlets_text = f"{outlet_names[0]} and {outlet_names[1]}"
                else:
                    outlets_text = f"{outlet_names[0]}, {outlet_names[1]}, and {outlet_names[2]}"
                
                # Create evidence sentence from actual snippet content
                if snippets:
                    # Extract key action from snippet
                    snippet_text = snippets[0][:80]
                    if len(snippet_text) > 60:
                        snippet_text = snippet_text[:60].rsplit(' ', 1)[0]
                    sentences.append(f"{connector} {outlets_text}: {snippet_text}.")
                else:
                    sentences.append(f"{connector} {outlets_text} confirm the details.")
        
        if not sentences:
            return ""
        
        return " ".join(sentences)
    
    def _transform_to_narrative(self, text: str, context: StoryContext) -> str:
        """Transform summary text into flowing narrative"""
        
        text = self._clean_text(text)
        if not text or len(text) < 20:
            return ""
        
        text = re.sub(r'^(The|A|An)\s+', '', text, flags=re.IGNORECASE)
        text = text[0].upper() + text[1:] if len(text) > 1 else text.upper()
        
        if not text.endswith(('.', '!', '?')):
            text += '.'
        
        return text
    
    def _compose_context_paragraph(self, headline: str, summary: str,
                                    context: StoryContext, voice: VoiceProfile) -> str:
        """Background context - country-specific"""
        
        key_figure = context.key_figure
        combined = f"{headline} {summary}".lower()
        
        if not key_figure:
            if 'ukraine' in combined:
                return "Ukraine has been defending against Russia's full-scale invasion since February 2022, relying heavily on Western military and financial support."
            if 'russia' in combined:
                return "Russia has faced sweeping international sanctions and isolation from Western economies since launching its invasion."
            return ""
        
        name = key_figure.get('name', '')
        country_code = key_figure.get('country', '')
        
        if country_code == 'CA':
            return f"{name} leads Canada's government at a time of economic pressures and shifting public sentiment. The country navigates complex trade relationships with the US while pursuing climate goals."
        if country_code == 'US':
            if 'ukraine' in combined:
                return f"{name}'s administration is recalibrating US policy on the Ukraine conflict, weighing continued support against domestic political pressures."
            if 'iran' in combined:
                return f"{name}'s Iran strategy unfolds against a backdrop of regional tensions and nuclear negotiations."
            return f"{name} leads an administration focused on reshaping America's domestic agenda and international relationships."
        if country_code == 'GB':
            return f"{name} leads the UK government as it navigates post-Brexit trade deals and questions about Britain's role on the world stage."
        if country_code == 'UA':
            return f"{name} leads Ukraine through its third year of war, balancing battlefield needs with diplomatic efforts to sustain Western support."
        if country_code == 'RU':
            return f"{name} continues to shape Russia's trajectory amid international sanctions and a protracted conflict with the West."
        
        return f"{name} has been a central figure in recent political developments."
    
    def _compose_closing_paragraph(self, headline: str, summary: str,
                                    context: StoryContext, voice: VoiceProfile,
                                    confidence: int) -> str:
        """Forward-looking conclusion"""
        
        key_figure = context.key_figure
        country_code = key_figure.get('country', '') if key_figure else None
        combined = f"{headline} {summary}".lower()
        
        if context.story_type == 'conflict':
            if country_code == 'UA' or 'ukraine' in combined:
                return "The coming weeks will be decisive. Ukraine's ability to sustain its defense depends on continued Western support."
            return "The humanitarian situation remains fragile, and the trajectory depends on decisions made far from the front lines."
        
        if context.story_type == 'political' and key_figure:
            name = key_figure.get('name', '')
            country = key_figure.get('country_name', '')
            return f"Looking ahead, the choices {name} makes will shape {country}'s direction for years to come."
        
        if context.story_type == 'economic':
            return "Markets and policymakers will be watching for signals of what comes next."
        
        if confidence >= 80:
            confidence_note = "This reporting is well-sourced across multiple outlets."
        elif confidence >= 60:
            confidence_note = "The story is supported by multiple sources."
        else:
            confidence_note = "This is a developing story."
        
        return f"What happens next remains uncertain. {confidence_note}"
    
    def _build_story_context(self, headline: str, summary: str, entities: Dict) -> StoryContext:
        """Build comprehensive story context"""
        combined = f"{headline} {summary}".lower()
        context = StoryContext()
        
        found_figures = []
        for key, data in self.POLITICAL_FIGURES.items():
            if len(key) <= 5:
                pattern = r'\b' + re.escape(key) + r'\b'
                if re.search(pattern, combined):
                    found_figures.append(data)
            else:
                if key in combined:
                    found_figures.append(data)
        
        seen_names = set()
        unique_figures = []
        for fig in found_figures:
            if fig.get('name') not in seen_names:
                seen_names.add(fig.get('name'))
                unique_figures.append(fig)
        
        if unique_figures:
            context.key_figure = unique_figures[0]
            context.country = unique_figures[0].get('country_name')
            context.country_code = unique_figures[0].get('country')
            context.is_political = True
            if unique_figures[0].get('country') == 'CA':
                context.is_canadian = True
            if len(unique_figures) > 1:
                context.secondary_figure = unique_figures[1]
        
        canadian_markers = ['canada', 'canadian', 'ottawa', 'toronto', 'vancouver', 'montreal',
                          'alberta', 'ontario', 'quebec', 'parliament hill', 'house of commons']
        for marker in canadian_markers:
            if marker in combined:
                context.is_canadian = True
                if not context.country:
                    context.country = 'Canada'
                break
        
        if any(w in combined for w in ['election', 'vote', 'poll', 'campaign']):
            context.story_type = 'political'
            context.urgency = 'high'
        elif any(w in combined for w in ['war', 'attack', 'strike', 'missile', 'invasion', 'battle']):
            context.story_type = 'conflict'
            context.urgency = 'urgent'
        elif any(w in combined for w in ['economy', 'market', 'trade', 'tariff', 'budget', 'inflation']):
            context.story_type = 'economic'
        elif context.is_political:
            context.story_type = 'political'
        
        breaking_markers = ['breaking', 'just in', 'developing', 'urgent', 'live']
        for marker in breaking_markers:
            if marker in headline.lower():
                context.is_breaking = True
                context.urgency = 'urgent'
                break
        
        return context
    
    # ==================== PRESERVED METHODS FROM V8 ====================
    
    def _clean_text(self, text: str) -> str:
        if not text:
            return ""
        text = re.sub(r'<[^>]+>', '', text)
        text = re.sub(r'https?://[^\s]+\.(jpg|jpeg|png|gif|webp)', '', text, flags=re.IGNORECASE)
        text = re.sub(r'external-preview\.redd\.it[^\s]*', '', text)
        text = re.sub(r'\s+', ' ', text)
        return text.strip()
    
    def calculate_confidence(self, research: Dict, claims: List[Dict]) -> int:
        score = 30
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
        claims = []
        combined = f"{headline}. {summary}" if summary else headline
        combined = self._clean_text(combined)
        sentences = re.split(r'(?<=[.!?])\s+', combined)
        
        for sentence in sentences:
            sentence = sentence.strip()
            if len(sentence) < 20:
                continue
            
            worthiness = 0
            if re.search(r'\d+', sentence):
                worthiness += 2
            
            entity_words = ['iran', 'israel', 'russia', 'ukraine', 'china', 'us', 'trump', 'biden',
                          'putin', 'zelenskyy', 'netanyahu', 'nato', 'canada', 'carney', 'trudeau']
            for word in entity_words:
                if word in sentence.lower():
                    worthiness += 2
                    break
            
            verify_verbs = ['announced', 'confirmed', 'reported', 'stated', 'said', 'launched',
                          'attacked', 'signed', 'agreed', 'rejected', 'approved', 'spoke']
            for verb in verify_verbs:
                if verb in sentence.lower():
                    worthiness += 1
                    break
            
            if worthiness >= 2:
                claims.append({'text': sentence, 'worthiness': worthiness, 'verified': False, 'status': 'unverified'})
        
        claims.sort(key=lambda x: x['worthiness'], reverse=True)
        return claims[:5]
    
    def verify_claims(self, claims: List[Dict], sources: List[Dict]) -> List[Dict]:
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
                
                if len(overlap) >= 3 and source.get('tier', 4) <= 2:
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
    
    def _format_related_stories(self, related_stories: List[Dict]) -> str:
        lines = ["---", "**Related:**"]
        for story in related_stories[:4]:
            country = story.get('country_name', 'World')
            headline = story.get('headline', '')
            if len(headline) > 80:
                headline = headline[:80].rsplit(' ', 1)[0] + "..."
            lines.append(f"• [{country}] {headline}")
        return "\n".join(lines)


def generate_analysis(headline: str, summary: str, research: Dict,
                      related_stories: List[Dict] = None) -> str:
    generator = NarrativeAnalysisGenerator()
    return generator.generate_analysis(headline, summary, research, related_stories)


if __name__ == "__main__":
    print("=== Test 1: Trump/Zelenskyy Story ===")
    test_research = {
        'entities': {
            'countries': [{'name': 'United States', 'code': 'US'}, {'name': 'Ukraine', 'code': 'UA'}],
            'people': [{'name': 'Donald Trump'}, {'name': 'Volodymyr Zelenskyy'}]
        },
        'sources': [
            {'title': 'Reuters', 'snippet': 'Trump spoke with Zelenskyy about military aid and peace negotiations', 'tier': 1},
            {'title': 'BBC News', 'snippet': 'US President discussed Ukraine war support with Kyiv', 'tier': 1},
            {'title': 'AP News', 'snippet': 'Phone call covered defense cooperation', 'tier': 1}
        ],
        'source_count': 8, 'tier1_count': 3, 'fact_check_count': 0, 'official_count': 1
    }
    
    generator = NarrativeAnalysisGenerator()
    analysis = generator.generate_analysis(
        "Trump and Zelenskyy discuss Ukraine war in phone call amid shifting US policy",
        "The US President spoke with Ukraine's leader about military support and potential peace negotiations as Washington reevaluates its approach to the conflict.",
        test_research
    )
    print(analysis)
    
    print("\n" + "="*60 + "\n")
    print("=== Test 2: Mark Carney Canadian Story ===")
    
    carney_research = {
        'entities': {
            'countries': [{'name': 'Canada', 'code': 'CA'}],
            'people': [{'name': 'Mark Carney', 'role': 'Prime Minister'}]
        },
        'sources': [
            {'title': 'CBC News', 'snippet': 'Mark Carney first year as PM examined through insider interviews', 'tier': 1},
            {'title': 'Globe and Mail', 'snippet': 'Canadian Prime Minister navigates economic challenges', 'tier': 1}
        ],
        'source_count': 6, 'tier1_count': 2, 'fact_check_count': 0, 'official_count': 0
    }
    
    analysis2 = generator.generate_analysis(
        "I spoke to over 30 sources about Mark Carney's first year as prime minister",
        "A deep look at the Prime Minister's first year in office through interviews with insiders reveals challenges shaping Canada's government.",
        carney_research
    )
    print(analysis2)
