# R3 Release Publication Gate — v0.3.0

## Status

**Publication state: `READY_FOR_HUMAN_GATE_B`**

This artifact prepares the separate publication gate for Insurance Claims Legacy Modernization R3. It does not itself publish a tag or GitHub Release while the pull request remains open.

## Immutable publication target

- Repository: `LuisHdezE/InsuranceClaims`
- Version: `0.3.0`
- Annotated tag: `v0.3.0`
- Release name: `Insurance Claims Legacy Modernization — R3 Full Product v0.3.0`
- Release commit: `014b2a4c4c38d94b07346aaa54bc32a8bbb7c5f9`
- Formalization PR: `#92`
- Formalization candidate head: `23cf9e812198e90036beb3555885198fe35e4546`
- Blueprint consumer: `0.5.2`
- Contract revision: `api-v1-r3`
- Delivery mode: `GREENFIELD`
- Legacy coexistence: `SIMULATED`

The annotated tag must resolve to the release commit above. The publication gate must never retarget `v0.3.0` to the publication-gate merge commit or any later commit.

## Preconditions already proven

PR #92 formalized version `0.3.0` and passed exact-head CI with the only red checks being the three preserved historical sentinels. The governed evidence includes:

- R3 Release Formalization `0.3.0`;
- R3 Full Product Technical Closure;
- R3 Final Closure;
- API QA with PostgreSQL 18;
- Integration QA - Web Slices;
- Release Gate Evidence;
- OpenAPI zero drift;
- Postman zero drift;
- historical `v0.2.0` preservation.

The released R3 contract remains:

- 90 effective REST operations;
- 76 REST paths;
- 16 operation families;
- 22 productized web surfaces;
- 3 documented deliberate UI exclusions.

## Gate B behavior

The publication workflow has two distinct modes.

### Pull request mode

On the publication-gate pull request it is read-only. It must:

1. verify the exact immutable release commit;
2. verify project version `0.3.0`;
3. verify `v0.2.0` remains pinned to its historical release commit;
4. prove `v0.3.0` does not yet exist;
5. prove no GitHub Release exists for `v0.3.0`;
6. revalidate the R3 full-product closure boundary;
7. verify the publication-gate changed-file boundary.

It must not create a tag or Release from a pull-request event.

### Main push mode after explicit human merge approval

When this publication-gate PR is explicitly approved and merged, the workflow may:

1. re-run the same preflight against `main`;
2. create an **annotated** tag object `v0.3.0` targeting `014b2a4c4c38d94b07346aaa54bc32a8bbb7c5f9`;
3. create the Git ref `refs/tags/v0.3.0` from that annotated tag object;
4. publish a non-draft, non-prerelease GitHub Release from `v0.3.0`;
5. use `documentation/portfolio/GITHUB_RELEASE_BODY_v0.3.0.md` as the public release body;
6. verify the remote annotated tag resolves back to the exact release commit;
7. verify the GitHub Release is public, non-draft and non-prerelease.

The workflow is fail-closed. If the tag or Release already exists before publication, or any immutable identity check fails, publication must stop rather than overwrite, move or recreate existing release state.

## Human authorization boundary

Merging the publication-gate PR is the explicit **Gate B** decision. Ordinary phrases such as `seguimos`, `adelante` or `continúa` authorize preparation and verification only. They do not authorize publication.

The required authorization wording is intentionally explicit, for example:

`Apruebo publicación v0.3.0 y merge PR #93`

## Historical preservation

Publication must not modify or recreate:

- `v0.2.0`;
- its annotated tag object;
- its release target commit;
- its GitHub Release payload;
- historical `0.1.0` evidence;
- the three historical sentinel workflows.

## Case-study disclosure

**Caso técnico no oficial · No oficial · Sin afiliación**

All business data are synthetic/demo data. The project does not claim production insurer infrastructure, private organizational processes, production data or affiliation with a real insurer.
