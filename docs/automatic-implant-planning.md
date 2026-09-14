# Automatic implant planning and virtual restorative targets

The planning inspector offers a cancellable worker-based rule/geometry search. It applies accepted drafts to the real implant state, retains the existing plan if no draft passes, and offers undo. The existing plan-to-simulation command consumes those implants. This is not a trained prediction model, and the bundled case regression is not clinical validation.

## Inputs and indications

Inputs are the active case's millimeter segmentation, chart, explicitly designated extractions and existing implant targets. Chart findings alone do not authorize extraction. Recorded existing implants and teeth designated for endodontics are excluded. Active inflammatory findings defer placement; incomplete chart entries remain visible in the rationale. Unrequested third molars are not automatically replaced.

## Virtual dentition

Missing segmented slots are populated with display-only reference tooth meshes from ToothFairy3 F_026. Each jaw is fitted independently using corresponding retained tooth cervical anchors: horizontal similarity registration plus height translation in the adapter's canonical frame. Scale is limited to 0.75–1.25. With no corresponding teeth, jaw-bone bounding boxes provide only a broad visualization. No tissue or original tooth can be recovered from this procedure.

Each inferred part records the method, supporting FDI teeth, fit residual and eligibility. The current prototype fit gate requires at least four bilateral supporting teeth spanning 25 mm with RMS residual no greater than 2 mm. These are engineering gates, not validated clinical confidence intervals. Sparse, unilateral and bone-only estimates can be displayed but cannot authorize placement. Bone and same-side critical-structure data remain required. A good template fit does not establish a missing tooth's original location, occlusion or surgical feasibility.

Original source parts, bytes and source hashes are unchanged. Inferred teeth remain missing in the initial chart and never count as observed teeth or tooth-borne guide supports. Number labels follow Universal/FDI/Palmer. `◇` denotes an expected restoration; `≈` marks a weakly supported inferred position. The inferred crown is hidden as natural anatomy and shown as a translucent restorative target; invented roots are not displayed as recovered anatomy.

The crown target remains on the registered arch independently of fixture depth/angle. Crown seating animation and reference CAD use this same target. The displayed fixture-to-crown connector is reference geometry; it is not a designed or validated manufacturer abutment. No occlusal equilibration, load simulation or manufacturing approval is performed.

## Diameter selection

Manual batch addition and automatic planning share tooth-class size preferences. Lower incisors, upper lateral/central incisors, canines, premolars and molars have different bounded search ranges. A 3 mm cervical band is measured in the tooth frame; 5th–95th percentile projected spans reduce isolated mesh outliers. These spans adjust a bounded diameter preference and limit the candidate set. Virtual teeth explicitly report their measurements as estimated.

The category limits and width-to-preference formula are prototype heuristics, not manufacturer indications or a direct crown-width prescription. Automatic planning tests each candidate diameter against bone and adjacent structures; it can select a different size or defer the site. Manual sizes remain editable. The catalog is generic and does not represent compatible commercial products. Bone quality, insertion torque, prosthetic load and immediate loading are not inferred.

## Geometry search

Candidates vary local position (center or ±1 mm), axis (0 or ±8° in one plane), depth (0, 2, 4, 6 mm), catalog length (6–11.5 mm) and eligible diameters. Exact triangle BVHs provide conservative capsule clearance lower bounds; sample half-spacing and implant radius are subtracted. Thresholds are 2 mm to canal/sinus surfaces, 1.5 mm to adjacent retained teeth and 3 mm between finite implant capsules. Whole-capsule screening is more conservative than shoulder-only spacing diagrams.

The bounded search retains five candidates per depth and diameter for bone checks. Sixty ring samples at implant radius +1 mm must have at least 80% mesh containment. This is a mesh support heuristic, not proof of intact cortical walls, bone quality, osseointegration or no augmentation requirement. Open segmentations, coarse surfaces, template uncertainty, registration errors and omitted anatomy can invalidate conclusions. Search failure means no draft was found within these limits, not that no clinical option exists.

## Verification

`tests/virtual-dentition.test.ts` covers immutable source data, complete slot identities, missing chart state, sparse and bone-only deferral, exclusion of phantom guide supports, tooth-class and thickness-dependent sizing, and preservation of manual edits. Geometry and sequence tests check conservative surface distances, crossed shafts, deterministic plans, serialization, target-specific sequencing, crown target persistence and CAD reference geometry.

`scripts/validate-auto-implant.ts` runs the same augmented-case pipeline across all 16 prepared ToothFairy2/3 cases. The report is `public/analysis/auto-implant-geometry-validation.json`. Requested sites are synthetic engineering inputs, not clinician recommendations. The report records inferred sites, proposed sizes, reasons for deferral and unchanged source hashes. It contains no clinician ground truth or success-rate claim.

## Reference sources

- [Straumann SMART assessment and planning](https://www.straumann.com/content/dam/media-center/straumann/smart/com/en/smart-one/clinical-theory-e-books/490.076-Smart1-1-2-com-en.pdf): critical anatomy and image-based planning.
- [Straumann implant-system technical information](https://www.straumann.com/content/dam/media-center/straumann/en/documents/brochure/technical-information/702084-en_low.pdf): adjacent-tooth space and implant shoulder diameter selection.
- [Straumann SMART Multi treatment planning](https://www.straumann.com/dam/media-center/straumann/smart/com/en/smart-multi/clinical-theory-e-books/490.090-SmartM-1-2-com-en.pdf): buccolingual bone width and surrounding walls.
- [ITI local risk factors](https://academy.iti.org/iti-academy-consensus/CC4_Group1_2.pdf): local risk assessment.
- [ToothFairy3](https://ditto.ing.unimore.it/toothfairy3/): dataset provenance; mesh-specific attribution remains in `public/anatomy/ATTRIBUTION.md`.

## Time and cost display

Every generated phase now includes a reference or estimated duration range, note and source IDs. The timing module separates initial wound review (7–14 days) from an additional bone-integration wait (2–6 months measured from the last placement). Already elapsed recovery is subtracted rather than counted twice. Extraction-to-deferred-placement, periodontal reassessment, abutment tissue healing and laboratory stages have their own intervals. Fine-grained operative times and multi-implant budgets are explicitly operational estimates; published half-hour single-implant information does not establish each drill action's duration.

The clock and tear-off calendar are deterministic projections of the same playhead, using range midpoints for animation. Pausing, scrubbing and replay do not create independent wall-clock timers. The calendar shows relative elapsed days, not booked dates. Interval bounds produce proposal duration ranges; booking delays, grafting and complications are outside the estimate. Newly introduced waiting stages also appear in the underlying surgical sequence.

Proposal cards show base cost, duration range and all planned visits, including prerequisite care and prosthetic visits. The KRW 1,100,000 default is a comparison example in HIRA's September 2026 release, not a national price range or a clinic quote. It assumes individual implant/abutment/crown packages. Additional unit prices start unquoted; a plus sign and breakdown keep them visible. A quoted zero means bundled/included. The same unit-price assumptions apply to every proposal, so a theme does not invent discounts. Bone grafts, sedation, temporary prostheses and insurance are not calculated. Visit counts are planned minimums, with root canal treatment counted as at least two visits and off-site laboratory work excluded.

Sources are linked in `lib/sequence-timing.ts` and `lib/proposal-estimates.ts`. Publicly described ranges inform this display; it is not calibrated against observed patient procedure timestamps, institution quotes or booked schedules.

Fee assumptions are validated as whole KRW amounts and included in plan-file/browser-plan serialization and the printable summary. Changing fees clears the current joint-choice record so an old acknowledgment is not presented alongside a new quote.
