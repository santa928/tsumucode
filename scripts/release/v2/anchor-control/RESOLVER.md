# Unconnected running-job resolver

This is a candidate for the host-side identity step only. The protected job must be
reviewed and deployed separately; no workflow or signing permission is enabled here.
`job.check_run_id` is a check-run ID, not an Actions job ID. The resolver reads the
attempt-scoped Jobs API at the fixed GitHub origin with an explicit Actions read token,
redirect and inherited proxy settings disabled, bounded pages and response sizes. It
matches a unique running `parent_producer` job to the run, attempt, source and check-run.
The token belongs only in this short host step and must not enter output, logs, files,
the producer container or later steps. No Actions write or OIDC permission is needed.
Anonymous access works for public resources but is limited by the source IP's rate limit.

The 45-second monotonic budget is checked around each read, and each request has a
15-second socket timeout. This alone cannot strictly interrupt every DNS or blocking OS
operation: a trusted outer process/job deadline must still terminate the step. No retries
or redirects are performed. Errors reject without logging response bodies or token data.

Pages can change between requests even when their counts remain equal. Duplicate and
missing rows are rejected, but this is not an atomic GitHub snapshot. After the producer
ends, a separately trusted consumer must require direct `needs.parent_producer.result`
success, re-read the attempt and completed job identity from the authenticated API, bind
the exact source/run/attempt/check-run and output digest, then re-observe the actual parent
before any admission. A current running job, caller-supplied expected values or a consistent
JSON document alone never proves workflow identity or authorizes a signature/publication.

Trusted runner, TLS roots, fixed resolver bytes and dependencies, same-UID isolation,
response provenance, fresh parent fence, privacy review, GitHub-hosted execution and signing
remain separate requirements. Do not put the token into a container or preserve raw API data
as a public artifact. The job guard remains closed until all of these are implemented and
independently reviewed.

References: https://docs.github.com/rest/actions/workflow-jobs and
https://docs.github.com/rest/using-the-rest-api/rate-limits-for-the-rest-api.
