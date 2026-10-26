# Panel 3.20.1 packaging Frontend 3.20.0

This packaging release includes Frontend 3.20.0's daily traffic-budget reference on node details and desktop/mobile node cards. Backend application logic, database migrations, node versions, configurations and subscriptions are unchanged.

The Node image version is pinned at 24.22.1 for all Docker stages, preserving the security runtime already deployed in production rather than downgrading it when rebuilding from source. The panel image version is `3.20.1-anytls`; the bundled frontend version is independently `3.20.0`.

Deployment must wait for frontend regression/release and the amd64 GitHub image build. Verify the backend/frontend revision labels and Node runtime, back up the existing panel configuration and database, then replace only the panel image by immutable digest. Retain the previous image for rollback. Do not reset usage, restart nodes or modify profiles, audit policies, subscriptions or credentials as part of this release.
