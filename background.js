let currentTab = null;
let startTime = null;

const categories = {
  'youtube.com': 'Video',
  'netflix.com': 'Video',
  'medium.com': 'Article',
  'wikipedia.org': 'Article',
  'github.com': 'Development',
  'stackoverflow.com': 'Development',
  'facebook.com': 'Social',
  'twitter.com': 'Social',
  'x.com': 'Social',
  'instagram.com': 'Social',
  'reddit.com': 'Social',
  'web.whatsapp.com': 'Social',
  'music.apple.com': 'Music',
  'open.spotify.com': 'Music',
  'music.amazon.com': 'Music',
  'google.com': 'Search',
  'amazon.com': 'Shopping',
  'linkedin.com': 'Professional',
  'gmail.com': 'Email',
  'outlook.com': 'Email',
  'yahoo.com': 'Email',
  'twitch.tv': 'Video',
  'tiktok.com': 'Social',
  'pinterest.com': 'Social',
  'ebay.com': 'Shopping',
  'nytimes.com': 'News',
  'cnn.com': 'News',
  'bbc.com': 'News',
  'espn.com': 'Sports',
  'booking.com': 'Travel',
  'airbnb.com': 'Travel',
  'zoom.us': 'Communication',
  'office.com': 'Productivity',
  'dropbox.com': 'Cloud Storage',
  'drive.google.com': 'Cloud Storage',
  'flipp.com': 'Shopping',
  'walmart.com': 'Shopping',
  'target.com': 'Shopping',
  'bestbuy.com': 'Shopping',
  'ebay.com': 'Shopping',
  'music.youtube.com': 'Music'
};

function cleanDomain(input) {
  try {
    // If input doesn't start with a protocol, add one
    if (!input.startsWith('http://') && !input.startsWith('https://')) {
      input = 'http://' + input;
    }
    
    const urlObject = new URL(input);
    let domain = urlObject.hostname;
    // Remove 'www.' if present
    domain = domain.replace(/^www\./, '');
    return domain;
  } catch (error) {
    console.error('Invalid URL:', input);
    return null;
  }
}

function getDomain(url) {
  return cleanDomain(url);
}

function isBlockedDomain(domain, blockedSites) {
  const cleanedDomain = cleanDomain(domain);
  return Object.keys(blockedSites).some(blockedDomain => {
    const cleanedBlockedDomain = cleanDomain(blockedDomain);
    return cleanedDomain === cleanedBlockedDomain || cleanedDomain.endsWith('.' + cleanedBlockedDomain);
  });
}

function getCategory(domain) {
  return categories[domain] || 'Other';
}

function updateTimeSpent(domain, timeSpent) {
  if (!domain) return;
  
  chrome.storage.local.get(['timeData']).then((result) => {
    let timeData = result.timeData || {};
    let today = new Date().toDateString();
    let weekStart = new Date(today);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    let weekKey = weekStart.toDateString();
    let monthKey = today.slice(4, 7) + ' ' + today.slice(11);
    
    if (!timeData[domain]) {
      timeData[domain] = { daily: {}, weekly: {}, monthly: {}, category: getCategory(domain) };
    }
    
    timeData[domain].daily[today] = (timeData[domain].daily[today] || 0) + timeSpent;
    timeData[domain].weekly[weekKey] = (timeData[domain].weekly[weekKey] || 0) + timeSpent;
    timeData[domain].monthly[monthKey] = (timeData[domain].monthly[monthKey] || 0) + timeSpent;
    
    chrome.storage.local.set({timeData: timeData});
  });
}

function updateCurrentTabTime() {
  if (currentTab) {
    let timeSpent = (new Date() - startTime) / 1000;
    updateTimeSpent(currentTab, timeSpent);
    startTime = new Date();
  }
}

function checkAndBlockSite(details) {
  const domain = getDomain(details.url);
  if (!domain) return;

  return new Promise((resolve) => {
    chrome.storage.local.get(['blockedSites'], (result) => {
      const blockedSites = result.blockedSites || {};
      const matchedDomain = Object.keys(blockedSites).find(key => {
        const cleanedKey = cleanDomain(key);
        const cleanedDomain = cleanDomain(domain);
        return cleanedDomain === cleanedKey || cleanedDomain.endsWith('.' + cleanedKey);
      });

      if (matchedDomain) {
        const blockData = blockedSites[matchedDomain];
        if (blockData.active && Date.now() < blockData.endTime) {
          resolve({ redirectUrl: chrome.runtime.getURL("blocked.html") });
        } else if (Date.now() >= blockData.endTime) {
          blockedSites[matchedDomain].active = false;
          chrome.storage.local.set({ blockedSites });
          resolve({});
        } else {
          resolve({});
        }
      } else {
        resolve({});
      }
    });
  });
}

chrome.webNavigation.onBeforeNavigate.addListener((details) => {
  checkAndBlockSite(details).then((result) => {
    if (result.redirectUrl) {
      chrome.tabs.update(details.tabId, { url: result.redirectUrl });
    }
  });
}, {url: [{schemes: ['http', 'https']}]});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "blockSite") {
    const { domain, duration } = request;
    const cleanedDomain = cleanDomain(domain);
    if (!cleanedDomain) {
      sendResponse({success: false, error: "Invalid domain format"});
      return true;
    }
    
    chrome.storage.local.get(['blockedSites'], (result) => {
      let blockedSites = result.blockedSites || {};
      blockedSites[cleanedDomain] = {
        active: true,
        endTime: Date.now() + duration * 60 * 60 * 1000 // Convert hours to milliseconds
      };
      chrome.storage.local.set({ blockedSites }, () => {
        sendResponse({success: true});
      });
    });
    return true;
  } else if (request.action === "unblockSite") {
    const { domain } = request;
    const cleanedDomain = cleanDomain(domain);
    if (!cleanedDomain) {
      sendResponse({success: false, error: "Invalid domain format"});
      return true;
    }

    chrome.storage.local.get(['blockedSites'], (result) => {
      let blockedSites = result.blockedSites || {};
      const matchedDomain = Object.keys(blockedSites).find(key => {
        const cleanedKey = cleanDomain(key);
        return cleanedDomain === cleanedKey;
      });

      if (matchedDomain) {
        blockedSites[matchedDomain].active = false;
        chrome.storage.local.set({ blockedSites }, () => {
          sendResponse({success: true});
        });
      } else {
        sendResponse({success: false, error: "Site not found in blocked list"});
      }
    });
    return true;
  }
});

chrome.tabs.onActivated.addListener((activeInfo) => {
  updateCurrentTabTime();
  chrome.tabs.get(activeInfo.tabId).then((tab) => {
    currentTab = getDomain(tab.url);
    startTime = new Date();
  });
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.active) {
    updateCurrentTabTime();
    currentTab = getDomain(tab.url);
    startTime = new Date();
  }
});

setInterval(updateCurrentTabTime, 1000);  // Update every second