/**
 * Pinned Stories Component
 * Displays top 3 pinned stories at the top of the feed
 */

class PinnedStories {
    constructor(containerId = 'pinned-stories') {
        this.container = document.getElementById(containerId);
        this.supabase = window.supabaseClient;
    }
    
    async load() {
        if (!this.container) return;
        
        try {
            const { data, error } = await this.supabase
                .from('stories')
                .select('id, headline, country_name, country_code, category, xray_score, created_at')
                .eq('is_pinned', true)
                .order('pin_priority', { ascending: false })
                .limit(3);
            
            if (error) throw error;
            
            if (data && data.length > 0) {
                this.render(data);
            } else {
                this.hide();
            }
        } catch (err) {
            console.error('Error loading pinned stories:', err);
            this.hide();
        }
    }
    
    render(stories) {
        if (!stories || stories.length === 0) {
            this.hide();
            return;
        }
        
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
    }
    
    renderStory(story, rank) {
        const score = story.xray_score || 0;
        const scoreClass = score >= 70 ? 'high' : score >= 50 ? 'medium' : 'low';
        const flagEmoji = this.getFlagEmoji(story.country_code);
        
        return `
            <div class="pinned-card" data-story-id="${story.id}" onclick="window.openStory('${story.id}')">
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
    
    hide() {
        if (this.container) {
            this.container.style.display = 'none';
        }
    }
    
    truncate(text, maxLength) {
        if (!text) return '';
        return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
    }
    
    getTimeAgo(dateString) {
        const date = new Date(dateString);
        const now = new Date();
        const minutes = Math.floor((now - date) / 60000);
        
        if (minutes < 60) return `${minutes}m ago`;
        const hours = Math.floor(minutes / 60);
        if (hours < 24) return `${hours}h ago`;
        return `${Math.floor(hours / 24)}d ago`;
    }
    
    getFlagEmoji(countryCode) {
        if (!countryCode || countryCode === 'XX') return '🌍';
        const codePoints = countryCode
            .toUpperCase()
            .split('')
            .map(char => 127397 + char.charCodeAt());
        return String.fromCodePoint(...codePoints);
    }
}

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', () => {
    window.pinnedStories = new PinnedStories('pinned-stories');
    if (window.pinnedStories) {
        window.pinnedStories.load();
    }
});

// Global function to open story
window.openStory = function(storyId) {
    if (window.storyDetail) {
        window.storyDetail.show(storyId);
    } else {
        window.location.href = `/story.html?id=${storyId}`;
    }
};
