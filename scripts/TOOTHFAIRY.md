# Local ToothFairy case library

Archives live in `../datasets/ToothFairy/`. They are kept untouched. Run `python scripts/toothfairy-cases.py scan` to index releases. The catalog contains 443 TF1, 480 TF2, 532 TF3 and **622 TF4 cases actually present in v03**, rather than the 625 described on the source website. IDs include the release; overlapping subjects are not counted as independent patients.

TF1 Raw DICOM is linked to the corresponding TF1 entry, not duplicated as a new case. TF3 Clicks is a supplementary annotation archive, not another patient set. Dense TF1 canal labels are distinguished from sparse annotations; sparse points are never turned into a continuous nerve.

Create a Python environment at `../.toothfairy-venv` and install `scripts/toothfairy-requirements.txt`, or set `ORALPILOT_DATA_PYTHON` to a prepared Python executable. `python scripts/toothfairy-cases.py prepare --case tf3-F_001` reads only that case from its archive and caches `case.json` + `surface.bin` under `../datasets/ToothFairy/oralpilot-cases/`. Development requests are same-origin, allow-listed by case ID and serialized to bound memory. Repeated requests reuse the cache. Browser cancellation does not apply a late result; an already-running conversion can finish in the cache.

Use `--publish` to copy a prepared case into `public/cases/toothfairy`, then run `scan` to refresh readiness. Public hosting has no access to the workstation's ZIP files: prepared examples load there directly, while the complete catalog identifies remaining cases as local-only. The catalog defaults to prepared cases when hosted. The original ToothFairy3 F_026 reference button remains separate and retains its plan.

## Geometry and provenance

TF2/3: original labeled tissue surfaces only, including individual teeth, pulp (TF3), jaws, canals, sinuses and restorations where present. All label components are retained. Voxel surfaces are smoothed and simplified for display, with smoothing displacement capped at 0.75 of the smallest voxel spacing to avoid unstable thin-triangle spikes; per-part source hashes, original label IDs, voxel spacing and conversion details are recorded. FDI label IDs remain source metadata regardless of display numbering.

TF1 and TF4: intensity isosurface previews, not anatomical segmentation. TF1 NPY has no physical affine; its viewer is labeled in **voxels**, not assumed millimeters. Dense TF1 canal annotations are shown separately where supplied. TF4 original English reports are retained verbatim, excluded from interface translation. TF4 labels are never borrowed from TF3 because orientations differ between releases.

TF1/2/3 stored voxel axes follow the dataset's RPI orientation. The conversion `[-x, y, -z]` followed by the existing viewer transform `[x,z,-y]` keeps handedness while displaying the superior direction upward. TF4 uses its NIfTI physical transform. No per-tissue recentering or invented gum, facial or vessel segmentation is applied. These imported cases use the existing external-case viewer and cannot inherit the reference patient's implants, periodontal values or surgical sequence.

Sources: [ToothFairy](https://ditto.ing.unimore.it/toothfairy/), [ToothFairy2](https://ditto.ing.unimore.it/toothfairy2/), [ToothFairy3 and orientation notes](https://ditto.ing.unimore.it/toothfairy3/), [ToothFairy4](https://ditto.ing.unimore.it/toothfairy4/). Release metadata in TF2/3 states CC BY-SA 4.0; the challenge usage restrictions differ. Existing project non-commercial research handling is retained; refer to original release terms before redistribution.
