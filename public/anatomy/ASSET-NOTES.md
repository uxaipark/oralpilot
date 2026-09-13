# Dental prototype asset provenance

## ToothFairy3 F_026 segmented anatomy

Files: `toothfairy.bin`, `toothfairy-manifest.json`. 70 aligned structures: 32 teeth, 32 pulp cavities, mandible, cropped maxilla, two inferior alveolar canals, and two sinus floors.

Original dataset: Federico Bolelli, Luca Lumetti, Shankeeth Vinayahalingam and colleagues, University of Modena and Reggio Emilia and Radboud University. https://ditto.ing.unimore.it/toothfairy3/

Mesh conversion and simplification: OMFAtlas contributors. https://github.com/choxos/OMFAtlas . Original asset attribution retained in `ATTRIBUTION.md`.

**License discrepancy:** the OMFAtlas derivative attributes these meshes to CC BY-SA 4.0, but the official challenge dataset page currently says **CC-BY-NC-SA**: https://toothfairy3.grand-challenge.org/dataset/ . Treat as a noncommercial research/education asset with attribution and ShareAlike obligations. Commercial permission has not been verified. Preserve both original-source and derivative-source links and this discrepancy notice. The official page does not specify a version; the derivative's own declaration links https://creativecommons.org/licenses/by-sa/4.0/ . The NC-SA 4.0 reference is https://creativecommons.org/licenses/by-nc-sa/4.0/ .

Geometry was extracted from a real CBCT segmentation at 0.3 mm spacing, then blurred, smoothed and simplified. The case is a teaching/research example; it is not a validated planning dataset. Gingiva and nerve tissue are absent. The two canal surfaces represent the inferior alveolar canals. Maxillary bone and sinus floors are cropped by scan field of view.

### Binary format

Little-endian packed typed arrays. For each manifest part:

```js
const positions = new Float32Array(buffer, part.positions, part.vertexCount * 3);
const normals = new Float32Array(buffer, part.normals, part.vertexCount * 3);
const indices = new Uint32Array(buffer, part.indices, part.indexCount);
```

Offsets are bytes. All positions share a millimeter coordinate frame: +X patient left, +Y posterior, +Z superior. Preserve the shared coordinates. To view in Y-up Three.js, subtract the full-assembly center `[-65.2955718, 41.0809445, -39.2897744]`, then apply rotation about X of -PI/2. A camera on positive scene Z views the anterior aspect. Whole bounds are `[-114.721, 0.137, -78.741]` to `[-15.870, 82.025, 0.162]` mm. Each tooth includes FDI identifier and jaw. Axes are derived estimates, not original tooth coordinate measurements.

## Real panoramic dental radiograph

File: `panorama-real.jpg`, 2500×1256, 308083 bytes. Creator: Fastsmiles. CC0 1.0 public-domain dedication. Original source: https://commons.wikimedia.org/wiki/File:Pano-GH21101912.jpg . Download: https://upload.wikimedia.org/wikipedia/commons/7/7a/Pano-GH21101912.jpg . License: https://creativecommons.org/publicdomain/zero/1.0/ . This is a separate subject from the mesh and CBCT sample.

## Real CBCT volume

Source file: `DZ-CBCT.nrrd`, SHA256 `4ce7aa75278b5a7b757ed0c8d7a6b3caccfc3e2973b020532456dbc8f3def7db`. Original: signed int16, 667×667×433, 0.25 mm isotropic, LPS orientation with oblique direction matrix, gzip-encoded NRRD.

Source: 3D Slicer `CBCT-MR Head` sample. Official attribution states it was donated by the imaged person for unrestricted use: https://github.com/Slicer/Slicer/blob/main/Modules/Scripted/SampleData/SampleData.py . Direct download: https://github.com/Slicer/SlicerTestingData/releases/download/SHA256/4ce7aa75278b5a7b757ed0c8d7a6b3caccfc3e2973b020532456dbc8f3def7db . No named Creative Commons license is stated for this sample; the explicit unrestricted-use donation is the relevant permission statement.

Browser derivative: `cbct-small-int16.raw.gz`, 6194340 compressed bytes, 223×223×145, signed int16 little-endian. Every third source voxel retained, spacing 0.75 mm. `cbct-small-metadata.json` preserves origin, direction matrix and source identity. Also provided uncompressed `cbct-small-int16.raw`. Storage: x fastest, `index = x + width * (y + height * z)`. Intensity display window can start at center 600 and width 2200. This volume is independent from the ToothFairy3 mesh and panoramic radiograph; the samples must not be presented as co-registered acquisitions from one person.

## CC BY 4.0 fallback lower arch

`dental.bin` + `manifest.json` filtered to `part.source === 'diaz'`. Cristian Diaz and colleagues (2024), “Data of synthetic 3D models of the human jaw, including teeth, ligaments, and bone structures.” https://data.mendeley.com/datasets/xjsx7nfhj8/1 . DOI https://doi.org/10.17632/xjsx7nfhj8.1 . Source page explicitly confirms CC BY 4.0: https://creativecommons.org/licenses/by/4.0/ . This is a published synthetic anatomical model of 14 lower teeth, cortical/cancellous alveolar bone and ligament shells, not a patient scan. Geometry assembled and packed by OMFAtlas without smoothing, scaling or moving the source components. `dental.bin` additionally carries Fang Fang Kang's immature molar model; exclude `part.source === 'fang'` unless needed, and consult the original attribution for its distinct reference.


## Infinite exterior face scan — CC BY 3.0

`face-scan/` contains the Lee Perry-Smith / Infinite-Realities head scan, distributed by three.js and Keijiro Takahashi with conversion contributions by Morgan McGuire and Guedis Cardenas. License: https://creativecommons.org/licenses/by/3.0/ . Original notice is retained in `face-scan/LICENSE.txt`; pinned acquisition URLs and SHA-256 values are in `face-scan/source.json`.

Source creator's project: https://www.ir-ltd.net/2023/04/09/irs-digital-doubles/ . Changes: cropped shoulders, two limited tangent-plane subdivisions retaining UVs, browser mesh packing, physical display material, approximate lip display crop, and illustrative placement relative to dental anchors. The 4K color and displacement, 1K normal and specular images and source GLB are unmodified. The original normal map is used on the clearcoat lobe; the 4K bump map supplies the base surface detail.

This scan and the ToothFairy3 dental CT are different subjects. No facial registration, skin thickness, lip support, clinical soft-tissue reconstruction or surgical suitability is established. The facial asset is excluded from quantitative anatomy and guide output. Its CC BY license is separate from the ToothFairy3 noncommercial/share-alike data license.
