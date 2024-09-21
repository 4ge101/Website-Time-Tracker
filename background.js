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
  'music.youtube.com': 'Music'
};

function getDomain(url) {
  try {
    const urlObject = new URL(url);
    let domain = urlObject.hostname;
    // Remove 'www.' if present
    domain = domain.replace(/^www\./, '');
    return domain;
  } catch (error) {
    console.error('Invalid URL:', url);
    return null;
  }
}
function isBlockedDomain(domain, blockedSites) {
  return Object.keys(blockedSites).some(blockedDomain => 
    domain === blockedDomain || domain.endsWith('.' + blockedDomain)
  );
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
      if (isBlockedDomain(domain, blockedSites)) {
        const blockData = blockedSites[Object.keys(blockedSites).find(key => domain === key || domain.endsWith('.' + key))];
        if (blockData.active && Date.now() < blockData.endTime) {
          resolve({ redirectUrl: chrome.runtime.getURL("blocked.html") });
        } else if (Date.now() >= blockData.endTime) {
          blockedSites[domain].active = false;
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
    const cleanDomain = getDomain('http://' + domain); // Ensure we store the clean domain
    chrome.storage.local.get(['blockedSites'], (result) => {
      let blockedSites = result.blockedSites || {};
      blockedSites[cleanDomain] = {
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
    const cleanDomain = getDomain('http://' + domain); // Ensure we use the clean domain
    chrome.storage.local.get(['blockedSites'], (result) => {
      let blockedSites = result.blockedSites || {};
      if (blockedSites[cleanDomain]) {
        blockedSites[cleanDomain].active = false;
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