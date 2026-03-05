// ================================================
// XRAYNEWS - Story Detail Page
// ================================================

(function() {
  'use strict';
  
  // Get story ID from URL params
  function getStoryId() {
    const params = new URLSearchParams(window.location.search);
    return params.get('id');
  }
  
  // Escape HTML
  function escHtml(s) {
    return String(s)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  }
  
  // Time ago formatter
  function timeAgo(iso) {
    if (!iso) return '';
    const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
    if (diff < 60) return diff + ' seconds ago';
    if (diff < 3600) return Math.floor(diff/60) + ' minutes ago';
    if (diff < 86400) return Math.floor(diff/3600) + ' hours ago';
    return Math.floor(diff/86400) + ' days ago';
  }
  
  // Get country flag emoji
  function getCountryFlag(code) {
    if (!code || code.length !== 2) return '';
    const offset = 0x1F1E6 - 65;
    return String.fromCodePoint(code.toUpperCase().charCodeAt(0) + offset)
         + String.fromCodePoint(code.toUpperCase().charCodeAt(1) + offset);
  }
  
  // Get score color
  function getScoreColor(score) {
    if (score <= 40) return '#ff4444';
    if (score <= 70) return '#ffaa00';
    return '#00ff88';
  }
  
  // Get status badge HTML
  function getStatusBadge(status) {
    const icons = {
      verified: '✓ VERIFIED',
      unverified: '? UNVERIFIED',
      contested: '⚡ CONTESTED',
      false: '✗ FALSE'
    };
    return '<span class="xray-status-badge status-' + status + '">' + (icons[status] || status.toUpperCase()) + '</span>';
  }
  
  // Get source type icon and class
  function getSourceTypeInfo(type) {
    const types = {
      legacy: { icon: '📰', class: 'source-legacy', label: 'Legacy Media' },
      official: { icon: '🏛️', class: 'source-official', label: 'Official Source' },
      social: { icon: '💬', class: 'source-social', label: 'Social Media' },
      independent: { icon: '🔍', class: 'source-independent', label: 'Independent' }
    };
    return types[type] || { icon: '📄', class: 'source-legacy', label: 'Source' };
  }
  
  // Show/hide elements
  function show(id) { document.getElementById(id).style.display = ''; }
  function hide(id) { document.getElementById(id).style.display = 'none'; }
  
  // Load story from Supabase
  async function loadStory() {
    const storyId = getStoryId();
    
    if (!storyId) {
      hide('story-loading');
      show('story-error');
      return;
    }
    
    if (!window.XrayNewsDB) {
      console.error('XrayNewsDB not available');
      hide('story-loading');
      show('story-error');
      return;
    }
    
    try {
      // Fetch story
      const story = await window.XrayNewsDB.getStory(storyId);
      
      if (!story) {
        hide('story-loading');
        show('story-error');
        return;
      }
      
      // Fetch verifications for this story
      let verifications = [];
      try {
        verifications = await window.XrayNewsDB.getVerifications(storyId);
      } catch(e) {}
      
      // Render story
      renderStory(story, verifications);
      
      // Load thread stories if this story is part of a thread
      if (story.story_thread_id) {
        loadThreadStories(story);
      } else {
        // Hide thread section if no thread
        const threadSection = document.getElementById('thread-section');
        if (threadSection) threadSection.style.display = 'none';
      }
      
      // Load related stories (same country or category)
      loadRelatedStories(story);
      
      hide('story-loading');
      show('story-content');
      
    } catch(err) {
      console.error('Error loading story:', err);
      hide('story-loading');
      show('story-error');
    }
  }
  
  // Render story content
  function renderStory(story, verifications) {
    // Category badge
    const catEl = document.getElementById('story-category');
    const catColor = story.category_color || '#00d4ff';
    catEl.innerHTML = (story.category_icon || '📰') + ' ' + escHtml(story.category || 'News');
    catEl.style.background = catColor + '22';
    catEl.style.color = catColor;
    
    // Country
    const flag = getCountryFlag(story.country_code);
    document.getElementById('story-country').innerHTML =
      flag ? flag + ' ' + escHtml(story.country_name || '') : '';
    
    // Source
    if (story.source_name) {
      document.getElementById('story-source').innerHTML = '📰 ' + escHtml(story.source_name);
    }
    
    // Time
    document.getElementById('story-time').innerHTML = '🕐 ' + timeAgo(story.created_at);
    
    // Thread badge (if story is part of a thread)
    const threadBadge = document.getElementById('thread-badge');
    if (threadBadge) {
      if (story.story_thread_id) {
        threadBadge.innerHTML = '🧵 Part of a thread';
        threadBadge.style.display = 'inline-block';
      } else {
        threadBadge.style.display = 'none';
      }
    }
    
    // Headline & Summary
    document.getElementById('story-headline').textContent = story.headline || '';
    document.getElementById('story-summary').textContent = story.summary || '';
    
    // Xray Score
    const score = story.xray_score || story.confidence_score || 0;
    const scoreColor = getScoreColor(score);
    
    document.getElementById('xray-score-value').textContent = score;
    document.getElementById('xray-score-circle').style.background =
      'conic-gradient(' + scoreColor + ' ' + (score * 3.6) + 'deg, rgba(255,255,255,0.1) 0deg)';
    document.getElementById('xray-score-circle').style.color = scoreColor;
    
    // Verdict
    const verdict = story.xray_verdict || 'Pending verification by Truth Engine';
    document.getElementById('xray-verdict-text').textContent = verdict;
    document.getElementById('xray-status-badge').innerHTML = getStatusBadge(story.status || 'unverified');
    
    // Score Breakdown
    renderScoreBreakdown(story);
    
    // Sources
    renderSources(verifications, story);
    
    // Timeline
    renderTimeline(story);
    
    // External link
    if (story.external_url) {
      document.getElementById('external-link').href = story.external_url;
    } else {
      document.getElementById('external-link').style.display = 'none';
    }
    
    // Page title
    document.title = (story.headline?.slice(0, 50) || 'Story') + ' - XrayNews';
    
    // Save button - NOW USES SUPABASE
    setupSaveButton(story);
    
    // Share button
    setupShareButton(story);
  }
  
  // Render score breakdown
  function renderScoreBreakdown(story) {
    const score = story.xray_score || story.confidence_score || 0;
    const container = document.getElementById('breakdown-list');
    
    // Calculate breakdown components (based on truth_engine.py logic)
    const sourceScore = Math.min(40, Math.floor(score * 0.4));
    const corrobScore = Math.min(30, (story.source_count || 1) * 6);
    const recencyScore = Math.max(0, 10 - Math.floor((Date.now() - new Date(story.created_at)) / 3600000 / 24));
    const statusScore = story.status === 'verified' ? 20 : (story.status === 'contested' ? -10 : 0);
    
    const breakdown = [
      { label: 'Source Credibility', value: sourceScore, max: 40, color: '#00d4ff' },
      { label: 'Corroboration', value: corrobScore, max: 30, color: '#00ff88' },
      { label: 'Recency', value: recencyScore, max: 10, color: '#ffaa00' },
      { label: 'Status Bonus', value: statusScore, max: 20, color: statusScore >= 0 ? '#00ff88' : '#ff4444' }
    ];
    
    container.innerHTML = breakdown.map(function(item) {
      return '<div class="breakdown-item">'
        + '<span class="breakdown-label">' + escHtml(item.label) + '</span>'
        + '<div class="breakdown-bar">'
          + '<div class="breakdown-fill" style="width:' + Math.max(0, (item.value / item.max) * 100) + '%;background:' + item.color + '"></div>'
        + '</div>'
        + '<span class="breakdown-value" style="color:' + item.color + '">' + (item.value >= 0 ? '+' : '') + item.value + '</span>'
      + '</div>';
    }).join('');
  }
  
  // Render verification sources
  function renderSources(verifications, story) {
    const container = document.getElementById('sources-list');
    
    // If no verifications from DB, show the main source
    if (!verifications || verifications.length === 0) {
      const typeInfo = getSourceTypeInfo('legacy');
      container.innerHTML =
        '<div class="source-item">'
          + '<div class="source-icon ' + typeInfo.class + '">' + typeInfo.icon + '</div>'
          + '<div class="source-info">'
            + '<div class="source-name">' + escHtml(story.source_name || 'Primary Source') + '</div>'
            + '<div class="source-type">' + typeInfo.label + '</div>'
          + '</div>'
          + '<span class="source-agree" style="color:#00ff88">✓</span>'
          + (story.external_url ? '<a href="' + escHtml(story.external_url) + '" target="_blank" class="source-link">🔗</a>' : '')
        + '</div>';
      return;
    }
    
    container.innerHTML = verifications.map(function(v) {
      const typeInfo = getSourceTypeInfo(v.source_type);
      const agreeIcon = v.agrees !== false ? '✓' : '✗';
      const agreeColor = v.agrees !== false ? '#00ff88' : '#ff4444';
      
      return '<div class="source-item">'
        + '<div class="source-icon ' + typeInfo.class + '">' + typeInfo.icon + '</div>'
        + '<div class="source-info">'
          + '<div class="source-name">' + escHtml(v.source_name || 'Unknown') + '</div>'
          + '<div class="source-type">' + typeInfo.label + '</div>'
        + '</div>'
        + '<span class="source-agree" style="color:' + agreeColor + '">' + agreeIcon + '</span>'
        + (v.source_url ? '<a href="' + escHtml(v.source_url) + '" target="_blank" class="source-link">🔗</a>' : '')
      + '</div>';
    }).join('');
  }
  
  // Render story timeline
  function renderTimeline(story) {
    const container = document.getElementById('story-timeline');
    
    const events = [
      {
        time: story.created_at,
        event: 'Story first detected by XrayNews gatherer'
      },
      {
        time: story.xray_score ? story.updated_at || story.created_at : null,
        event: story.xray_score
          ? 'Truth Engine analysis complete — Score: ' + story.xray_score
          : 'Pending Truth Engine analysis'
      }
    ];
    
    // Add status change event if verified
    if (story.status === 'verified') {
      events.push({
        time: story.updated_at || story.created_at,
        event: 'Status changed to ' + story.status.toUpperCase()
      });
    }
    
    container.innerHTML = events
      .filter(function(e) { return e.time; })
      .sort(function(a, b) { return new Date(b.time) - new Date(a.time); })
      .map(function(e) {
        return '<div class="timeline-item">'
          + '<div class="timeline-time">' + timeAgo(e.time) + '</div>'
          + '<div class="timeline-event">' + escHtml(e.event) + '</div>'
        + '</div>';
      }).join('');
  }
  
  // Load thread stories
  async function loadThreadStories(story) {
    const container = document.getElementById('thread-list');
    const section = document.getElementById('thread-section');
    const badge = document.getElementById('thread-badge');
    
    if (!container || !story.story_thread_id) return;
    
    try {
      // Fetch stories with same thread_id
      const allStories = await window.XrayNewsDB.getStories({ limit: 50 });
      
      // Filter to same thread
      const threadStories = allStories.filter(function(s) {
        return s.story_thread_id === story.story_thread_id;
      }).sort(function(a, b) {
        return new Date(a.created_at) - new Date(b.created_at); // Oldest first
      });
      
      if (threadStories.length <= 1) {
        if (section) section.style.display = 'none';
        return;
      }
      
      // Update badge
      if (badge) {
        badge.innerHTML = '🧵 Part of thread: ' + threadStories.length + ' stories';
      }
      
      // Find current story index
      const currentIndex = threadStories.findIndex(function(s) { return s.id === story.id; });
      
      // Render thread navigation
      const navHtml = renderThreadNav(threadStories, currentIndex);
      
      // Render thread list
      const listHtml = threadStories.map(function(s, idx) {
        const score = s.xray_score || s.confidence_score || 0;
        const scoreColor = getScoreColor(score);
        const isActive = s.id === story.id;
        
        return '<a href="story.html?id=' + s.id + '" class="thread-item' + (isActive ? ' thread-active' : '') + '">'
          + '<span class="thread-num">#' + (idx + 1) + '</span>'
          + '<div class="thread-content">'
            + '<div class="thread-headline">' + escHtml(s.headline) + '</div>'
            + '<div class="thread-meta">'
              + '<span style="color:' + scoreColor + '">' + score + '%</span>'
              + '<span>' + timeAgo(s.created_at) + '</span>'
            + '</div>'
          + '</div>'
          + (isActive ? '<span class="thread-current">▸</span>' : '')
        + '</a>';
      }).join('');
      
      container.innerHTML = navHtml + '<div class="thread-items">' + listHtml + '</div>';
      if (section) section.style.display = '';
      
    } catch(err) {
      console.error('Error loading thread stories:', err);
      if (section) section.style.display = 'none';
    }
  }
  
  // Render thread navigation (prev/next)
  function renderThreadNav(threadStories, currentIndex) {
    const prevStory = currentIndex > 0 ? threadStories[currentIndex - 1] : null;
    const nextStory = currentIndex < threadStories.length - 1 ? threadStories[currentIndex + 1] : null;
    
    let navHtml = '<div class="thread-nav">';
    
    if (prevStory) {
      navHtml += '<a href="story.html?id=' + prevStory.id + '" class="thread-nav-btn thread-prev">'
        + '← Previous'
        + '</a>';
    } else {
      navHtml += '<span class="thread-nav-btn thread-nav-disabled">← Oldest</span>';
    }
    
    navHtml += '<span class="thread-position">' + (currentIndex + 1) + ' of ' + threadStories.length + '</span>';
    
    if (nextStory) {
      navHtml += '<a href="story.html?id=' + nextStory.id + '" class="thread-nav-btn thread-next">'
        + 'Next →'
        + '</a>';
    } else {
      navHtml += '<span class="thread-nav-btn thread-nav-disabled">Latest →</span>';
    }
    
    navHtml += '</div>';
    return navHtml;
  }
  
  // Load related stories
  async function loadRelatedStories(story) {
    const container = document.getElementById('related-list');
    
    try {
      // Fetch stories with same country or category
      const allStories = await window.XrayNewsDB.getStories({ limit: 20 });
      
      // Filter to related (same country OR category, exclude current and thread)
      const related = allStories
        .filter(function(s) { return s.id !== story.id; })
        .filter(function(s) { 
          // Exclude stories from same thread (they're shown in thread section)
          if (story.story_thread_id && s.story_thread_id === story.story_thread_id) {
            return false;
          }
          return s.country_code === story.country_code || s.category === story.category;
        })
        .slice(0, 4);
      
      if (related.length === 0) {
        container.innerHTML = '<p style="color:#666">No related stories found.</p>';
        return;
      }
      
      container.innerHTML = related.map(function(s) {
        const score = s.xray_score || s.confidence_score || 0;
        const scoreColor = getScoreColor(score);
        
        // Add thread badge if part of thread
        const threadBadgeHtml = s.story_thread_id 
          ? '<span class="related-thread-badge" title="Part of thread">🧵</span>' 
          : '';
        
        return '<a href="story.html?id=' + s.id + '" class="related-item">'
          + '<div class="related-score" style="background:' + scoreColor + '22;color:' + scoreColor + '">' + score + '</div>'
          + '<div class="related-headline">' + escHtml(s.headline) + '</div>'
          + threadBadgeHtml
          + '<span style="color:#666">→</span>'
        + '</a>';
      }).join('');
      
    } catch(err) {
      console.error('Error loading related stories:', err);
      container.innerHTML = '<p style="color:#666">Could not load related stories.</p>';
    }
  }
  
  // Setup save button - UPDATED TO USE SUPABASE
  async function setupSaveButton(story) {
    const btn = document.getElementById('save-btn');
    
    // Check if already saved using XrayNewsSaved (async with Supabase)
    let isSaved = false;
    if (window.XrayNewsSaved) {
      isSaved = await window.XrayNewsSaved.isStorySaved(story.id);
    } else {
      // Fallback to localStorage
      try {
        const saved = JSON.parse(localStorage.getItem('xraynews_saved') || '[]');
        isSaved = saved.some(function(s) { return s.id === story.id; });
      } catch(e) {}
    }
    
    btn.innerHTML = isSaved ? '⭐ Saved' : '☆ Save Story';
    
    btn.addEventListener('click', async function() {
      // Show loading state
      btn.disabled = true;
      btn.style.opacity = '0.6';
      
      try {
        if (window.XrayNewsSaved) {
          // Use Supabase-backed save
          const storyMeta = {
            id: story.id,
            headline: story.headline,
            summary: story.summary,
            country_code: story.country_code,
            country_name: story.country_name,
            category: story.category,
            xray_score: story.xray_score,
            status: story.status
          };
          
          const nowSaved = await window.XrayNewsSaved.toggleSaveStory(story.id, storyMeta);
          btn.innerHTML = nowSaved ? '⭐ Saved' : '☆ Save Story';
        } else {
          // Fallback to localStorage
          let saved = [];
          try {
            saved = JSON.parse(localStorage.getItem('xraynews_saved') || '[]');
          } catch(e) {}
          
          const idx = saved.findIndex(function(s) { return s.id === story.id; });
          if (idx >= 0) {
            saved.splice(idx, 1);
            btn.innerHTML = '☆ Save Story';
          } else {
            saved.unshift({
              id: story.id,
              headline: story.headline,
              country_code: story.country_code,
              country_name: story.country_name,
              xray_score: story.xray_score,
              status: story.status,
              saved_at: new Date().toISOString()
            });
            btn.innerHTML = '⭐ Saved';
          }
          
          localStorage.setItem('xraynews_saved', JSON.stringify(saved.slice(0, 100)));
        }
      } catch(err) {
        console.error('[StoryDetail] Save error:', err);
      } finally {
        btn.disabled = false;
        btn.style.opacity = '';
      }
    });
  }
  
  // Setup share button
  function setupShareButton(story) {
    const btn = document.getElementById('share-btn');
    
    btn.addEventListener('click', async function() {
      const shareData = {
        title: story.headline,
        text: story.summary || story.headline,
        url: window.location.href
      };
      
      if (navigator.share) {
        try {
          await navigator.share(shareData);
        } catch(err) {
          // User cancelled or error
        }
      } else {
        // Fallback: copy to clipboard
        try {
          await navigator.clipboard.writeText(window.location.href);
          btn.innerHTML = '✓ Copied!';
          setTimeout(function() { btn.innerHTML = '📤 Share Story'; }, 2000);
        } catch(err) {
          console.error('Could not copy:', err);
        }
      }
    });
  }
  
  // Initialize on page load
  document.addEventListener('DOMContentLoaded', loadStory);
  
})();
