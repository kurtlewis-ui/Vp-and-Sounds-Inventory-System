# Login readiness and cold-start feedback

The login page starts one safe /health warm-up when mounted. Submission awaits that same in-flight promise, or reuses readiness confirmed within the last 60 seconds. There is no recurring warm-up interval.

After 3 seconds of waiting, an accessible live status explains that the server may be waking from inactivity. The submit button stays disabled while a submitted attempt waits. Health reads use 30-second probe limits, spaced backoff, at most eight attempts and a 120-second overall deadline. Leaving the page cancels probes and retry timers. Offline and non-gateway server failures are surfaced without pretending every failure is a cold start.

Credentials are sent once, only after health succeeds. Login POST requests have a 30-second timeout and are never automatically replayed. Invalid credentials and disabled accounts retain their own messages; transport timeouts use friendly text instead of raw Axios errors.

Validation: production frontend build; node frontend/scripts/check-login-readiness.cjs; existing efficiency checks; 32 mocked browser flows across the four projects, dark/light and mobile/desktop. Browser checks cover delayed startup past 15 seconds, successful login after readiness, no duplicate warm-up/POST, invalid password, disabled account, server failure and transport failure. Deterministic checks cover repeated gateway errors beyond a minute, deadline exhaustion, offline, cancellation, readiness caching and stale readiness.
