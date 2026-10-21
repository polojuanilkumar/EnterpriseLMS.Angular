# Core

`auth` owns the typed BFF client and in-memory session/CSRF state. `http` contains
the interceptor restricted to root-relative `/bff/*` requests. API JWTs stay in
LMS.Web; UI guards do not grant access to backend resources.
