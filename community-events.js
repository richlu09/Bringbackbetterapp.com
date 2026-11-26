const byId = id => document.getElementById(id);
const submit = byId('submit-event');
const review = byId('review-login');
const formatter = new Intl.DateTimeFormat('en-US', { dateStyle: 'full', timeZone: 'UTC' });

async function callEvents({ token, data } = {}) {
  const headers = {};
  if (token) headers.Authorization = 'Bearer ' + token;
  if (data) headers['Content-Type'] = 'application/json';
  const response = await fetch('./api/community-events' + (token ? '?view=admin' : ''), {
    method: data ? 'POST' : 'GET',
    headers,
    body: data ? JSON.stringify(data) : undefined
  });
  if (!response.headers.get('Content-Type')?.includes('application/json')) {
    throw new Error('Community event posting is being set up.');
  }
  const result = await response.json();
  if (!response.ok) throw new Error(result.error);
  return result;
}

function cards(container, events, actions) {
  container.replaceChildren();
  for (const event of events) {
    const card = document.createElement('article');
    for (const [tag, value] of [
      ['h3', event.name],
      ['p', formatter.format(new Date(event.date + 'T00:00:00Z')) + ' · ' + event.venue],
      ['p', event.description]
    ]) {
      const element = document.createElement(tag);
      element.textContent = value;
      card.append(element);
    }
    actions?.(card, event);
    container.append(card);
  }
}

async function loadCalendar() {
  const status = byId('calendar-status');
  try {
    const { events } = await callEvents();
    cards(byId('calendar'), events);
    status.textContent = events.length ? '' : 'No upcoming events have been published yet.';
    submit.querySelector('button').disabled = false;
  } catch (error) {
    status.textContent = error.message;
  }
}

submit.addEventListener('submit', async event => {
  event.preventDefault();
  const button = submit.querySelector('button');
  const status = byId('submit-status');
  button.disabled = true;
  status.textContent = 'Sending…';
  try {
    await callEvents({ data: Object.fromEntries(new FormData(submit)) });
    submit.reset();
    status.textContent = 'Your event was sent for review.';
  } catch (error) {
    status.textContent = error.message;
  } finally {
    button.disabled = false;
  }
});

async function loadReview(token) {
  const status = byId('review-status');
  const list = byId('review-list');
  list.replaceChildren();
  status.textContent = 'Loading…';
  try {
    const { events } = await callEvents({ token });
    status.textContent = events.length ? '' : 'No events are waiting for review.';
    cards(list, events, (card, event) => {
      for (const [label, decision] of [['Approve', 'approved'], ['Decline', 'rejected']]) {
        const button = document.createElement('button');
        button.textContent = label;
        button.addEventListener('click', async () => {
          const buttons = card.querySelectorAll('button');
          buttons.forEach(item => { item.disabled = true; });
          try {
            await callEvents({ token, data: { id: event.id, status: decision } });
            await loadReview(token);
            await loadCalendar();
          } catch (error) {
            status.textContent = error.message;
            buttons.forEach(item => { item.disabled = false; });
          }
        });
        card.append(button);
      }
    });
  } catch (error) {
    status.textContent = error.message;
  }
}

review.addEventListener('submit', async event => {
  event.preventDefault();
  const token = new FormData(review).get('token').trim();
  if (!token) return;
  review.reset();
  const button = review.querySelector('button');
  button.disabled = true;
  await loadReview(token);
  button.disabled = false;
});
loadCalendar();
