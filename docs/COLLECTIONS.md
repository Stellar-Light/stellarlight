# Collections

This document explains all collections, their purpose, relationships, and how they work together.

## Overview

The directory uses 4 main collections:
1. **Projects** - Individual projects/applications in the Stellar ecosystem
2. **Entities** - Organizations, companies, or teams that own multiple projects
3. **TransparencyLogs** - Audit trail of all changes made to the directory
4. **SyncJobs** - Records of automated data imports from external sources

---

## 1. Projects Collection

### Purpose
Represents individual projects, applications, tools, or services in the Stellar ecosystem (e.g., "StellarX Wallet", "Stellar Horizon API", "Stellar Quest").

### Key Fields

#### Basic Information
- **name** (text, required) - Project name (e.g., "StellarX")
- **slug** (text, required, unique) - URL-friendly identifier (auto-generated from name)
- **shortDescription** (textarea) - Brief description of the project
- **category** (select, required) - Type of project:
  - Infrastructure
  - Tooling
  - Partner Integration
  - User-Facing App
  - Asset
  - Protocol/Contract
  - Anchor
- **types** (select, multiple) - What the project is:
  - Wallet, Anchor, Bridge, SDK, Payment Rail, DEX, Indexer, Explorer, Other
- **status** (select, required) - Development stage:
  - Development (in development)
  - Pre-Release (beta/testing)
  - Live (production-ready)

#### Links
- **links** (group) - External resources:
  - website
  - github
  - docs
  - twitter
  - discord

#### On-Chain Data
- **onchain** (group) - Blockchain-related information:
  - assetCode - Stellar asset code
  - issuer - Stellar account issuer
  - contracts - Array of smart contract addresses

#### Verification & Provenance
- **verificationLevel** (select, required) - Trust level:
  - Unverified (default for user submissions)
  - Verified (SDF) - Verified by Stellar Development Foundation
  - Verified (Community) - Verified by community moderators
- **provenance** (group) - Source tracking:
  - source - Where the entry came from: LumenloopSeed | UserSubmitted | AdminEdit
  - sourceId - Unique identifier from source
  - firstSeenAt - When this project was first added
- **lastVerifiedAt** (date) - Last time verification status was updated

### Access Control
- **Read**: Public (anyone can view)
- **Create**: 
  - Admins can create from backend
  - Public can create via intake form (creates Unverified projects)
- **Update**: Admin-only

### Hooks
- **beforeValidate**: Auto-generates slug from name, normalizes URLs
- **afterChange**: Automatically creates TransparencyLog entry for audit trail

### Versioning
Projects have version history enabled - you can see previous versions and changes over time.

---

## 2. Entities Collection

### Purpose
Represents organizations, companies, or teams that build multiple projects. For example:
- "Stellar Development Foundation" might have projects like "Horizon", "Stellar Core", etc.
- "Circle" might have multiple Stellar-related products

### Key Fields

#### Basic Information
- **name** (text, required) - Organization name (e.g., "Stellar Development Foundation")
- **slug** (text, required, unique) - URL-friendly identifier
- **domains** (array) - List of domains owned by this entity (e.g., ["stellar.org", "sdf.org"])

#### Links
- **links** (group):
  - website
  - github
  - twitter

#### Relationships
- **projects** (relationship, multiple) - Links to Projects collection. An entity can own many projects.

### Access Control
- **Read**: Public (anyone can view)
- **Create**: Admin-only (from backend)
- **Update**: Admin-only

### Hooks
- **beforeValidate**: Auto-generates slug from name, normalizes URLs

### When to Use Entities vs Projects

**Use Entities when:**
- An organization/company builds multiple projects
- You want to group related projects together
- You need to track organizational information separately from projects

**Use Projects when:**
- It's a standalone project without clear organizational owner
- The project is the primary focus (not the organization)

**Example:**
- Entity: "Stellar Development Foundation"
  - Project: "Horizon API"
  - Project: "Stellar Core"
  - Project: "Stellar Laboratory"
- Entity: "Circle"
  - Project: "USDC on Stellar"
  - Project: "Circle Developer Tools"

---

## 3. TransparencyLogs Collection

### Purpose
Audit trail that records every change made to the directory for transparency and accountability.

### Key Fields
- **action** (select) - What happened:
  - Create - New entry created
  - Update - Existing entry modified
  - SyncImport - Entry imported from Lumenloop sync
  - Intake - Entry submitted via public intake form
- **actorType** (select) - Who made the change:
  - System - Automated system action
  - User - Public user submission
  - Admin - Admin user action
- **targetCollection** (text) - Which collection was modified (e.g., "projects")
- **targetId** (text) - ID of the modified document
- **diff** (json) - Before/after data showing what changed
- **timestamp** (date) - When the change occurred

### Access Control
- **Read**: Public (anyone can view the audit trail)
- **Create/Update**: System-only (automatically created by hooks)

### Usage
Transparency logs are automatically created by the Projects collection's `afterChange` hook. They're displayed on project detail pages to show change history.

---

## 4. SyncJobs Collection

### Purpose
Tracks automated data synchronization jobs, particularly imports from external sources like the Lumenloop ecosystem database.

### Key Fields
- **source** (select) - Data source (currently: "Lumenloop")
- **status** (select) - Job status:
  - Running - Import in progress
  - Completed - Successfully finished
  - Failed - Error occurred
- **stats** (json) - Statistics object:
  - inserted - Number of new entries created
  - updated - Number of existing entries updated
  - skipped - Number of entries skipped (e.g., duplicates)
  - errors - Number of errors encountered
- **startedAt** (date) - When the sync job started
- **finishedAt** (date) - When the sync job completed/failed
- **log** (textarea) - Error messages or detailed log output

### Access Control
- **Read**: Admin-only (sensitive operation details)
- **Create/Update**: System-only (created by sync endpoint)

### Usage
When you run the Lumenloop sync endpoint (`/api/sync/lumenloop`), it creates a SyncJob record to track the import process and results.

---

## Data Flow & Relationships

### How They Connect

```
Entities
  └─> projects (relationship) ──> Projects (multiple)
       └─> afterChange hook ──> TransparencyLogs (audit trail)

SyncJobs ──> tracks imports that create/update Projects
Projects ──> creates TransparencyLogs on every change
```

### Typical Workflows

#### 1. Admin Adds Project via Backend
1. Admin logs into Payload admin panel
2. Creates new Project entry
3. `beforeValidate` hook: auto-generates slug, normalizes URLs
4. Project saved
5. `afterChange` hook: creates TransparencyLog entry with action="Create", actorType="Admin"

#### 2. Public User Submits via Intake Form
1. User fills out `/submit` form
2. POST to `/api/intake` validates data
3. Creates Project with `provenance.source="UserSubmitted"`, `verificationLevel="Unverified"`
4. `afterChange` hook: creates TransparencyLog entry with action="Intake", actorType="User"

#### 3. Lumenloop Sync Import
1. Admin triggers `/api/sync/lumenloop`
2. Creates SyncJob record (status="Running")
3. Fetches data from Lumenloop repo
4. Maps and upserts Projects with `provenance.source="LumenloopSeed"`
5. Each create/update triggers `afterChange` hook → TransparencyLog (action="SyncImport")
6. Updates SyncJob with stats and status="Completed"

#### 4. Linking Projects to Entities
1. Admin creates Entity (e.g., "Stellar Development Foundation")
2. Admin creates or updates Projects
3. In admin panel, links Projects to Entity via the `projects` relationship field
4. Now Entity page shows all related projects

---

## Frontend Visibility

### Projects
- **Directory Page**: `/directory` - Lists all projects (filtered by status)
- **Project Detail**: `/project/[slug]` - Shows full project information + transparency logs
- **Search**: Available on directory page

### Entities
- **Entities Page**: `/entities` - Lists all entities with their projects
- **Search**: Available on entities page
- Projects can also reference their parent entity (if linked)

### Transparency Logs
- Visible on project detail pages (last 5 entries)
- Publicly readable audit trail

---

## Best Practices

### When Creating Projects
1. **Auto-generated fields**: Slug is auto-generated, but you can customize it
2. **Provenance**: Set appropriate source:
   - `AdminEdit` for manual backend creation
   - `LumenloopSeed` for sync imports (auto-set)
   - `UserSubmitted` for intake form (auto-set)
3. **Verification**: Start as "Unverified" for user submissions, upgrade to verified after review

### When Creating Entities
1. **Link Projects**: After creating entity, link related projects via the relationship field
2. **Domains**: Add all domains the entity owns for better tracking
3. **Name Consistency**: Use full official name (e.g., "Stellar Development Foundation" not "SDF")

### Transparency
- All changes are automatically logged - no manual logging needed
- Transparency logs are public to build trust
- Sync jobs are admin-only to protect system details

---

## Access Summary

| Collection | Public Read | Public Create | Admin Create | Admin Update |
|------------|-------------|---------------|--------------|--------------|
| Projects | ✅ Yes | ✅ (via intake, Unverified only) | ✅ Yes | ✅ Yes |
| Entities | ✅ Yes | ❌ No | ✅ Yes | ✅ Yes |
| TransparencyLogs | ✅ Yes | ❌ (System only) | ❌ (System only) | ❌ (System only) |
| SyncJobs | ❌ No | ❌ (System only) | ❌ (System only) | ❌ (System only) |

---

## Questions?

- **Projects vs Entities**: Projects are individual apps/tools. Entities are organizations that own multiple projects.
- **Why Transparency Logs**: Build trust by showing all changes publicly
- **Why Sync Jobs**: Track automated imports for debugging and monitoring

