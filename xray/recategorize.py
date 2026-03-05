#!/usr/bin/env python3
"""
GlobeWatch Recategorization Script
Recategorizes all stories using expanded CATEGORY_MAP terms
"""

import os
import re
import sys
from supabase import create_client

# Supabase configuration
SUPABASE_URL = os.environ.get('SUPABASE_URL', 'https://gebogzeqczjbkqgnxrhf.supabase.co')
# Try multiple env var names for the service key
SUPABASE_KEY = (
    os.environ.get('SERVICE_ROLE_SUBABASE') or 
    os.environ.get('SUPABASE_SERVICE_KEY') or 
    os.environ.get('SUPABASE_ANON_KEY', '')
)

# Expanded CATEGORY_MAP matching the CF worker
CATEGORY_MAP = [
    {
        "name": "War & Conflict",
        "icon": "⚔️",
        "color": "#ff4444",
        "terms": re.compile(r'\b(war|attack|strike|military|troops|bomb|missile|killed|wounded|ceasefire|invasion|offensive|drone|airstrike|casualties|shelling|frontline|combat|battle|siege|sniper|artillery|armored|munitions|forces|conflict|headquarters|rebels|fighters|army|navy|air force|terrorist|militia|explosion|destroyed|captured|retreat|advanc|defend|weapon|soldier|gunfire|ambush|raid|hostage|prisoner|detainee|camp|base|operation)\b', re.I)
    },
    {
        "name": "Elections",
        "icon": "🗳️",
        "color": "#4488ff",
        "terms": re.compile(r'\b(election|vote|ballot|polling|candidate|president|parliament|congress|senate|referendum|campaign|inauguration|primary|runoff|democracy|electoral|poll|polls|voter|voting|conservative|liberal|republican|democrat|tory|labour|moderate|leftist|right-wing|politician|lawmaker|governor|mayor|minister|chancellor)\b', re.I)
    },
    {
        "name": "Weather & Disaster",
        "icon": "🌊",
        "color": "#ffaa00",
        "terms": re.compile(r'\b(hurricane|typhoon|earthquake|flood|tornado|wildfire|tsunami|drought|volcano|storm|disaster|cyclone|blizzard|avalanche|landslide|magnitude|tremor|rain|snow|hail|heatwave|cold|freeze|wildfire|fire|burning|blackout|power outage|emergency|evacuat|rescue|collapse|crash|accident|wreck|casualties|dead|injured)\b', re.I)
    },
    {
        "name": "Economy",
        "icon": "📈",
        "color": "#00d4ff",
        "terms": re.compile(r'\b(gdp|inflation|recession|trade|tariff|sanctions|bank|currency|markets|stocks|bonds|interest rate|imf|world bank|economic|deficit|surplus|debt|unemployment|fed|central bank|growth|economy|financial|revenue|profit|loss|invest|investor|stock|share|price|cost|wage|salary|tax|budget|spending|consumer|retail|manufacturing|industry|production|export|import|deal|merger|acquisition|layoff|jobs|employment)\b', re.I)
    },
    {
        "name": "Science & Tech",
        "icon": "🔬",
        "color": "#00ff88",
        "terms": re.compile(r'\b(nasa|spacex|satellite|rocket|iss|orbit|launch|climate|ai|artificial intelligence|nuclear|quantum|genome|vaccine|research|discovery|asteroid|probe|telescope|technology|tech|digital|cyber|software|hardware|computer|data|algorithm|robot|automation|innovation|startup|biotech|medical breakthrough|study|scientist|experiment|physics|chemistry|biology|mars|moon|space)\b', re.I)
    },
    {
        "name": "Health",
        "icon": "🏥",
        "color": "#ff69b4",
        "terms": re.compile(r'\b(pandemic|outbreak|virus|disease|epidemic|who|health|hospital|medical|vaccine|treatment|pathogen|quarantine|mortality|infection|variant|mpox|covid|ebola|doctor|nurse|patient|medicine|drug|fda|clinical|trial|symptom|diagnosis|cancer|heart|surgery|mental health|therapy|addiction|overdose|opioid)\b', re.I)
    },
    {
        "name": "Politics",
        "icon": "🏛️",
        "color": "#7b2fff",
        "terms": re.compile(r'\b(diplomacy|treaty|summit|protest|coup|overthrow|assassination|rally|opposition|regime|impeach|scandal|corrupt|bribe|lobby|policy|legislation|bill|law|court|judge|supreme|justice|attorney|lawsuit|trial|verdict|convict|acquit|pardon|amnesty|exile|asylum|refugee|immigration|border|deport|visa|citizenship|passport|diplomat|embassy|ambassador|foreign|ministry|secretary)\b', re.I)
    },
    {
        "name": "Environment",
        "icon": "🌿",
        "color": "#44ff88",
        "terms": re.compile(r'\b(climate change|deforestation|pollution|carbon|emissions|biodiversity|species|coral|glacier|arctic|amazon|fossil fuel|renewable|solar|wind energy|cop[0-9]|environment|ecosystem|wildlife|endangered|extinct|conservation|preserve|protect|habitat|forest|ocean|sea|river|lake|wetland|drought|famine|water|air quality|waste|recycle|plastic|green|sustainable)\b', re.I)
    },
]

def detect_category(text):
    """Detect category from text using expanded CATEGORY_MAP"""
    if not text:
        return {"name": "Politics", "icon": "🏛️", "color": "#7b2fff"}
    
    for cat in CATEGORY_MAP:
        if cat["terms"].search(text):
            return {"name": cat["name"], "icon": cat["icon"], "color": cat["color"]}
    
    # Default fallback
    return {"name": "Politics", "icon": "🏛️", "color": "#7b2fff"}

def main():
    print("="*60)
    print("GlobeWatch Recategorization Script")
    print("="*60)
    
    # Connect to Supabase
    print(f"\n📡 Connecting to Supabase...")
    try:
        sb = create_client(SUPABASE_URL, SUPABASE_KEY)
    except Exception as e:
        print(f"❌ Failed to connect: {e}")
        sys.exit(1)
    
    # Fetch all stories
    print("📥 Fetching all stories...")
    try:
        result = sb.table('stories').select('id, headline, summary, category').execute()
        stories = result.data
        print(f"   Found {len(stories)} stories")
    except Exception as e:
        print(f"❌ Failed to fetch stories: {e}")
        sys.exit(1)
    
    # Track changes
    changes = []
    category_counts_before = {}
    category_counts_after = {}
    
    # Count before
    for story in stories:
        cat = story.get('category', 'Politics')
        category_counts_before[cat] = category_counts_before.get(cat, 0) + 1
    
    print(f"\n📊 BEFORE recategorization:")
    for cat, count in sorted(category_counts_before.items(), key=lambda x: -x[1]):
        pct = (count / len(stories) * 100) if stories else 0
        print(f"   {cat}: {count} ({pct:.1f}%)")
    
    # Process each story
    print(f"\n🔄 Processing stories...")
    for story in stories:
        story_id = story['id']
        headline = story.get('headline', '')
        summary = story.get('summary', '')
        old_category = story.get('category', 'Politics')
        
        # Combine headline and summary for detection
        text = f"{headline} {summary}"
        
        # Detect new category
        new_cat = detect_category(text)
        new_category = new_cat['name']
        
        # Track for after counts
        category_counts_after[new_category] = category_counts_after.get(new_category, 0) + 1
        
        # If category changed, update it
        if new_category != old_category:
            changes.append({
                'id': story_id,
                'headline': headline[:60] + '...' if len(headline) > 60 else headline,
                'old': old_category,
                'new': new_category
            })
            
            # Update in database
            try:
                sb.table('stories').update({
                    'category': new_cat['name'],
                    'category_icon': new_cat['icon'],
                    'category_color': new_cat['color']
                }).eq('id', story_id).execute()
            except Exception as e:
                print(f"   ⚠️ Failed to update {story_id}: {e}")
    
    # Report results
    print(f"\n📊 AFTER recategorization:")
    for cat, count in sorted(category_counts_after.items(), key=lambda x: -x[1]):
        pct = (count / len(stories) * 100) if stories else 0
        print(f"   {cat}: {count} ({pct:.1f}%)")
    
    print(f"\n📈 CHANGES SUMMARY:")
    print(f"   Total stories processed: {len(stories)}")
    print(f"   Stories recategorized: {len(changes)}")
    
    if changes:
        print(f"\n📝 Sample changes (first 15):")
        for c in changes[:15]:
            print(f"   [{c['old']} → {c['new']}] {c['headline']}")
        if len(changes) > 15:
            print(f"   ... and {len(changes) - 15} more")
    
    print(f"\n✅ Recategorization complete!")
    return changes

if __name__ == "__main__":
    main()
