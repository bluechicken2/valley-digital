/**
 * Pinned Stories Component
 * Displays top 3 pinned stories at the top of the feed
 */

class PinnedStories {
    constructor(containerId = 'pinned-stories') {
        this.container = document.getElementById(containerId);
    }
    
    async load() {
        if (!this.container) return;
        
        try {
            if (!window.XrayNewsDB) {
                console.warn('[PinnedStories] XrayNewsDB not ready');
                this.hide();
                return;
            }
            
            const url = window.XrayNewsDB.getUrl() + '/rest/v1/stories' +
                '?select=id,headline,country_name,country_code,category,xray_score,created_at,summary,status,xray_verdict,source_count,xray_analysis' +
                '&is_pinned=eq.true' +
                '&order=pin_priority.desc' +
                '&limit=3';
            
            const response = await fetch(url, {
                headers: {
                    'apikey': window.XrayNewsDB.getKey(),
                    'Authorization': 'Bearer ' + window.XrayNewsDB.getKey()
                }
            });
            
            if (!response.ok) throw new Error('Fetch failed: ' + response.status);
            
            const data = await response.json();
            
            if (data && data.length > 0) {
                this.render(data);
            } else {
                this.hide();
            }
        } catch (err) {
            console.error('[PinnedStories] Error:', err);
            this.hide();
        }
    }
    
    hide() {
        if (this.container) this.container.style.display = 'none';
    }
    
    render(stories) {
        if (!stories || stories.length === 0) { this.hide(); return; }
        
        const html = `
            <div class="pinned-section">
                <div class="pinned-header">
                    <span class="pinned-icon">📌</span>
                    <h3>TOP STORIES</h3>
                    <span class="pinned-updated">Updated ${this.getTimeAgo(stories[0].created_at)}</span>
                </div>
                <div class="pinned-grid">
                    ${stories.map((story, index) => this.renderStory(story, index + 1)).join('')}
                </div>
            </div>
        `;
        
        this.container.innerHTML = html;
        this.container.style.display = 'block';
        
        // Wire up click events using data attributes (avoids inline onclick quoting issues)
        this.container.querySelectorAll('.pinned-card').forEach(card => {
            const storyId = card.dataset.storyId;
            const story = JSON.parse(card.dataset.story);
            card.addEventListener('click', () => window.openPinnedStory(storyId, story));
        });
    }
    
    renderStory(story, rank) {
        const score = story.xray_score || 0;
        const scoreClass = score >= 70 ? 'high' : score >= 50 ? 'medium' : 'low';
        const flagEmoji = this.getFlagEmoji(story.country_code);
        // Safely encode story data for dataset
        const storyJson = JSON.stringify(story).replace(/'/g, '&#39;');
        
        return `
            <div class="pinned-card" data-story-id="${story.id}" data-story='${storyJson}'>
                <div class="pinned-rank">#${rank}</div>
                <div class="pinned-content">
                    <div class="pinned-country">
                        ${flagEmoji} ${story.country_name || 'World'}
                    </div>
                    <div class="pinned-headline">${this.truncate(story.headline, 80)}</div>
                    <div class="pinned-meta">
                        <span class="pinned-category">${story.category || 'News'}</span>
                        <span class="pinned-score ${scoreClass}">${score}%</span>
                    </div>
                </div>
            </div>
        `;
    }
    
    truncate(str, len) {
        if (!str) return '';
        return str.length > len ? str.substring(0, len) + '...' : str;
    }
    
    getTimeAgo(dateStr) {
        if (!dateStr) return 'recently';
        const date = new Date(dateStr);
        const diffMins = Math.floor((Date.now() - date) / 60000);
        if (diffMins < 1) return 'just now';
        if (diffMins < 60) return `${diffMins}m ago`;
        const hours = Math.floor(diffMins / 60);
        if (hours < 24) return `${hours}h ago`;
        return `${Math.floor(hours / 24)}d ago`;
    }
    
    getFlagEmoji(countryCode) {
        if (!countryCode || countryCode === 'XX') return '🌍';
        const codePoints = countryCode.toUpperCase().split('')
            .map(char => 127397 + char.charCodeAt());
        return String.fromCodePoint(...codePoints);
    }
}

// Retry initialization until XrayNewsDB is available (up to 3 seconds)
document.addEventListener('DOMContentLoaded', () => {
    function tryInit(attemptsLeft) {
        if (window.XrayNewsDB) {
            window.pinnedStories = new PinnedStories('pinned-stories');
            window.pinnedStories.load();
        } else if (attemptsLeft > 0) {
            setTimeout(() => tryInit(attemptsLeft - 1), 300);
        } else {
            console.warn('[PinnedStories] XrayNewsDB never became available');
        }
    }
    tryInit(10); // retry up to 10x × 300ms = 3s
});

// Global function to open a pinned story
window.openPinnedStory = function(storyId, pinnedStory) {
    // Prefer StoryModal (used on dashboard)
    if (window.StoryModal) {
        // Try to get the richer story object from NewsFeed first
        var feedStories = window.NewsFeed ? window.NewsFeed.getAll() : [];
        var story = feedStories.find(s => String(s.id) === String(storyId));
        // Fall back to the pinned story data (may have fewer fields)
        story = story || pinnedStory;
        window.StoryModal.open(story, feedStories.length ? feedStories : [story]);
        return;
    }
    // Fallback: navigate to story page
    window.location.href = '/story.html?id=' + storyId;
};
