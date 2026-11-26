# Bringbackbetter
The community bringing generations together

## Community events on Cloudflare Pages

Create a D1 database, apply `events-schema.sql`, and bind the database as
`EVENTS_DB` in the Pages project's settings. Add `EVENTS_ADMIN_TOKEN`
as an encrypted secret with a randomly generated access key of at least
32 bytes. Redeploy after configuring both bindings. Use a separate
database and access key for preview deployments.

Open `community-events.html` to submit an event. Open Organizer review
on that page and enter the access key to review pending submissions.
Share the key only with authorized reviewers. The private event planner
stores drafts in the browser and remains available at `events.html`.
