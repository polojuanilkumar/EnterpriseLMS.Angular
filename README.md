# EnterpriseLmsAngular

Organization administration, scoped reports and read-only audit are documented in [docs/organization-administration.md](docs/organization-administration.md).

Staff quiz/assignment authoring and final grading are documented in [docs/staff-assessments.md](docs/staff-assessments.md).

Staff course authoring routes, contracts, security decisions, verification and deployment gaps are documented in [docs/staff-authoring.md](docs/staff-authoring.md).

This project was generated using [Angular CLI](https://github.com/angular/angular-cli) version 19.2.19.

## Development server

Complete the trusted HTTPS certificate setup in [docs/bff-authentication.md](docs/bff-authentication.md) before starting the dev server. That guide also documents the four BFF contracts and the separate backend start commands.

To start a local development server, run:

```powershell
$env:NODE_EXTRA_CA_CERTS = (Resolve-Path .certs/localhost.pem).Path
npm.cmd start -- --host localhost --port 4200
```

Once the server is running, open your browser and navigate to `https://localhost:4200/`. The application will automatically reload whenever you modify any of the source files.

The development proxy forwards `/bff/**` to LMS.Web at `https://localhost:7207`
with TLS verification enabled; Web calls the API at `https://localhost:7196/`.
These normal development ports are separate from the dynamically allocated
ports used by the isolated backend smoke environment.

## Code scaffolding

Angular CLI includes powerful code scaffolding tools. To generate a new component, run:

```bash
ng generate component component-name
```

For a complete list of available schematics (such as `components`, `directives`, or `pipes`), run:

```bash
ng generate --help
```

## Building

To build the project run:

```bash
ng build
```

This will compile your project and store the build artifacts in the `dist/` directory. By default, the production build optimizes your application for performance and speed.

## Running unit tests

To execute unit tests with the [Karma](https://karma-runner.github.io) test runner, use the following command:

```bash
ng test
```

## Running end-to-end tests

For end-to-end (e2e) testing, run:

```bash
ng e2e
```

Angular CLI does not come with an end-to-end testing framework by default. You can choose one that suits your needs.

## Additional Resources

For more information on using the Angular CLI, including detailed command references, visit the [Angular CLI Overview and Command Reference](https://angular.dev/tools/cli) page.

Platform administration, trusted /app deployment and private account recovery: [implementation report](docs/platform-account.md).
