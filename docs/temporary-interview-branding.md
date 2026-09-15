# Temporary interview logo

The navigation header temporarily shows the OSSTEM IMPLANT logo above the original OralPilot name for the owner's interview presentation. The product name, studio subtitle and creator menu remain visible. Compact navigation also retains the OralPilot name below the logo.

To restore the previous header, set `INTERVIEW_BRANDING` to `false` in `lib/interview-branding.ts` and rebuild/deploy. No interview date or automatic expiry has been assumed.

## Asset provenance

- Official website: https://en.osstem.com/company/company-outline
- Original asset: PNG embedded in https://en.osstem.com/js/app.58e03693.js (webpack module 14464, official header/footer logo).
- Retrieved: 2026-09-15.
- Local copy: `public/brand/osstem-implant.png`, 321 × 120 pixels; original bytes preserved, transparent background.
- OSSTEM IMPLANT is the logo owner. This asset is not an OralPilot-created graphic.

The desktop and compact navigation use the same original image, proportionally scaled. No external image request is needed at runtime.
