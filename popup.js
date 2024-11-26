let currentView = 'daily';
let currentCategory = 'All';
let pieChart = null;

function formatTime(seconds) {
  let hours = Math.floor(seconds / 3600);
  let minutes = Math.floor((seconds % 3600) / 60);
  seconds = Math.floor(seconds % 60);
  return `${hours}h ${minutes}m ${seconds}s`;
}

function getRelevantData(timeData, view) {
  let today = new Date().toDateString();
  let weekStart = new Date(today);
  weekStart.setDate(weekStart.getDate() - weekStart.getDay());
  let weekKey = weekStart.toDateString();
  let monthKey = today.slice(4, 7) + ' ' + today.slice(11);

  return Object.entries(timeData).reduce((acc, [domain, data]) => {
    if (currentCategory === 'All' || data.category === currentCategory) {
      acc[domain] = data[view][view === 'daily' ? today : view === 'weekly' ? weekKey : monthKey] || 0;
    }
    return acc;
  }, {});
}

function updateDashboard(refreshChart = false) {
  chrome.storage.local.get(['timeData']).then((result) => {
    let timeData = result.timeData || {};
    let relevantData = getRelevantData(timeData, currentView);
    updateTimeList(relevantData);
    if (refreshChart) {
      updatePieChart(relevantData);
    }
  });
}

function updatePieChart(data) {
  const ctx = document.getElementById('pieChart').getContext('2d');
  const sortedData = Object.entries(data).sort((a, b) => b[1] - a[1]);
  const topSites = sortedData.slice(0, 5);
  const otherTime = sortedData.slice(5).reduce((sum, [_, time]) => sum + time, 0);

  const labels = [...topSites.map(([domain, _]) => domain), 'Other'];
  const values = [...topSites.map(([_, time]) => time), otherTime];

  if (pieChart) {
      pieChart.destroy();
  }

  pieChart = new Chart(ctx, {
      type: 'pie',
      data: {
          labels: labels,
          datasets: [{
              data: values,
              backgroundColor: [
                  '#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF', '#C9CBCF'
              ]
          }]
      },
      options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
              title: {
                  display: true,
                  text: `Top Websites (${currentView.charAt(0).toUpperCase() + currentView.slice(1)})`,
                  color: '#e0e0e0'
              },
              legend: {
                  position: 'right',
                  labels: {
                      color: '#e0e0e0'
                  }
              }
          }
      }
  });
}

function updateTimeList(data) {
  let timeList = document.getElementById('timeList');
  timeList.innerHTML = '';
  
  let sortedDomains = Object.entries(data).sort((a, b) => b[1] - a[1]);

  for (let [domain, time] of sortedDomains) {
    if (time > 0) {
      let li = document.createElement('li');
      li.className = 'website';
      li.innerHTML = `
        <img class="favicon" src="https://www.google.com/s2/favicons?domain=${domain}" alt="favicon">
        <span class="url">${domain}</span>
        <span class="time">${formatTime(time)}</span>
      `;
      timeList.appendChild(li);
    }
  }
}

function updateBlockedList() {
  chrome.storage.local.get(['blockedSites'], (result) => {
    const blockedSites = result.blockedSites || {};
    const blockedList = document.getElementById('blockedList');
    blockedList.innerHTML = '';

    for (const [domain, data] of Object.entries(blockedSites)) {
      if (data.active) {
        const li = document.createElement('li');
        const remainingTime = Math.max(0, (data.endTime - Date.now()) / 1000);
        li.textContent = `${domain} (${formatTime(remainingTime)} remaining)`;
        
        const unblockBtn = document.createElement('button');
        unblockBtn.textContent = 'Unblock';
        unblockBtn.onclick = () => unblockSite(domain);
        
        li.appendChild(unblockBtn);
        blockedList.appendChild(li);
      }
    }
  });
}

function blockSite(domain, duration) {
  chrome.runtime.sendMessage({
    action: "blockSite",
    domain: domain,
    duration: duration
  }, (response) => {
    if (response && response.success) {
      updateBlockedList();
    } else {
      console.error("Failed to block site");
    }
  });
}

function unblockSite(domain) {
  chrome.runtime.sendMessage({
    action: "unblockSite",
    domain: domain
  }, (response) => {
    if (response && response.success) {
      updateBlockedList();
    } else {
      console.error("Failed to unblock site");
    }
  });
}

document.addEventListener('DOMContentLoaded', function() {
  updateDashboard(true);  // Initial load with chart
  updateBlockedList();
  setInterval(() => updateDashboard(false), 1000);  // Update list every second without refreshing chart
  setInterval(updateBlockedList, 60000);  // Update blocked list every minute

  const dailyBtn = document.getElementById('dailyBtn');
  const weeklyBtn = document.getElementById('weeklyBtn');
  const monthlyBtn = document.getElementById('monthlyBtn');
  const categorySelect = document.getElementById('categorySelect');
  const refreshChartBtn = document.getElementById('refreshChart');
  const chartSection = document.getElementById('chartSection');
  const blockForm = document.getElementById('blockForm');
  const blockDomainInput = document.getElementById('blockDomain');
  const blockDurationInput = document.getElementById('blockDuration');

  function setActiveButton(button) {
    [dailyBtn, weeklyBtn, monthlyBtn].forEach(btn => btn.classList.remove('active'));
    button.classList.add('active');
  }

  dailyBtn.addEventListener('click', () => {
    currentView = 'daily';
    setActiveButton(dailyBtn);
    updateDashboard(true);
  });

  weeklyBtn.addEventListener('click', () => {
    currentView = 'weekly';
    setActiveButton(weeklyBtn);
    updateDashboard(true);
  });

  monthlyBtn.addEventListener('click', () => {
    currentView = 'monthly';
    setActiveButton(monthlyBtn);
    updateDashboard(true);
  });

  categorySelect.addEventListener('change', (event) => {
    currentCategory = event.target.value;
    updateDashboard(true);
  });

  refreshChartBtn.addEventListener('click', () => {
    updateDashboard(true);
  });

  blockForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const domain = blockDomainInput.value.trim();
    const duration = parseFloat(blockDurationInput.value);
    if (domain && !isNaN(duration) && duration > 0) {
      blockSite(domain, duration);
      blockDomainInput.value = '';
      
      blockDurationInput.value = '';
    } else {
      alert('Please enter a valid domain and duration');
    }
  });
});