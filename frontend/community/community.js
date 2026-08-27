const API_URL = '/api/community-reports';
const storedUser = JSON.parse(localStorage.getItem('nirapodUser') || 'null');
const currentUserId = storedUser?.id || storedUser?._id || 'guest-user';
let activeReportToFlag = null;

const reportFeed = document.getElementById('reportsFeed');
const noReportsMessage = document.getElementById('noReportsMessage');
const createReportForm = document.getElementById('createReportForm');

async function loadReports() {
    try {
        const response = await fetch(API_URL);
        const result = await response.json();

        if (result.success) {
            renderReports(result.data);
        }
    } catch (err) {
        console.error('Failed to load reports:', err);
        reportFeed.innerHTML = '<p class="error-text">Could not load reports. Please refresh.</p>';
    }
}

function renderReports(reports) {
    reportFeed.innerHTML = '';

    if (!reports.length) {
        noReportsMessage.classList.remove('hidden');
        return;
    }

    noReportsMessage.classList.add('hidden');

    reports.forEach((report) => {
        const card = document.createElement('article');
        card.className = 'report-card';
        card.innerHTML = `
            <div class="card-header">
                <div>
                    <h4>${report.title}</h4>
                    <p class="report-location">📍 ${report.location || 'Unknown location'}</p>
                </div>
            </div>
            <p class="report-description">${report.description}</p>
            <div class="reaction-bar">
                <button class="btn-react" onclick="react('${report._id}', 'helpful')">
                    👍 Helpful (${report.reactions?.helpful?.length || 0})
                </button>
                <button class="btn-react" onclick="react('${report._id}', 'important')">
                    ⚠️ Important (${report.reactions?.important?.length || 0})
                </button>
                <button class="btn-react" onclick="react('${report._id}', 'support')">
                    ❤️ Support (${report.reactions?.support?.length || 0})
                </button>
                <button class="btn-flag" onclick="openFlagModal('${report._id}')">
                    🚩 Report
                </button>
            </div>
        `;

        reportFeed.appendChild(card);
    });
}

async function react(reportId, type) {
    try {
        const response = await fetch(`${API_URL}/${reportId}/react`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ type, userId: currentUserId })
        });
        const data = await response.json();

        if (data.success) {
            loadReports();
        } else {
            alert(data.message || 'Unable to add reaction.');
        }
    } catch (err) {
        console.error('Error adding reaction:', err);
        alert('An error occurred while reacting to the report.');
    }
}

function openFlagModal(reportId) {
    activeReportToFlag = reportId;
    document.getElementById('flagModal').classList.remove('hidden');
}

function closeFlagModal() {
    activeReportToFlag = null;
    document.getElementById('flagModal').classList.add('hidden');
}

createReportForm?.addEventListener('submit', async (event) => {
    event.preventDefault();

    const title = document.getElementById('reportTitle').value.trim();
    const description = document.getElementById('reportDescription').value.trim();
    const location = document.getElementById('reportLocation').value.trim();

    if (!title || !description) {
        alert('Please enter both title and description for the report.');
        return;
    }

    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ title, description, location, userId: currentUserId })
        });
        const data = await response.json();

        if (data.success) {
            createReportForm.reset();
            loadReports();
        } else {
            alert(data.message || 'Unable to submit report.');
        }
    } catch (err) {
        console.error('Error submitting report:', err);
        alert('An error occurred while submitting the report.');
    }
});

document.getElementById('submitFlagBtn').addEventListener('click', async () => {
    if (!activeReportToFlag) return;

    const reason = document.getElementById('flagReason').value;
    const details = document.getElementById('flagDetails').value;

    try {
        const response = await fetch(`${API_URL}/${activeReportToFlag}/flag`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ reason, details, userId: currentUserId })
        });

        const result = await response.json();
        alert(result.message || 'Report submitted.');
        closeFlagModal();
        loadReports();
    } catch (err) {
        console.error('Error reporting content:', err);
        alert('An error occurred while reporting the content.');
    }
});

const backButton = document.getElementById('backButton');
if (backButton) {
    backButton.addEventListener('click', () => {
        if (window.history.length > 1) {
            window.history.back();
        } else {
            window.location.href = '/dashboard.html';
        }
    });
}

loadReports();