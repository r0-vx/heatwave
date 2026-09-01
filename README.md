# HeatShield — Mumbai Heat-Health Operations

Municipal decision-support for **SIH26083 — Extreme Heatwave Early Warning & Human Thermal Stress Index**. The system is built around Mumbai's 24 BMC administrative wards, source provenance, operational response tasks, alert review and an auditable event stream.

## Deployment

- Architecture: Vercel React/Vite frontend → Vercel FastAPI service → Neon PostgreSQL with PostGIS.
- Frontend: <https://sih26083-heatwave.vercel.app>
- Backend: <https://sih26083-heatwave-api.vercel.app> (`/api/health`, `/docs`)
- GitHub `main` is connected to both Vercel projects for automatic production deployments.
- Required production variable names: `DATABASE_URL`, `CORS_ORIGINS`, `APP_ENV`, `WEATHER_PROVIDER`, `ALERT_PROVIDER`, `SMS_TEST_MODE`, and frontend-only `VITE_API_BASE_URL`.
- Optional provider variable names: `IMD_API_KEY`, `IMD_STATION_ID`, `IMD_API_KEY_HEADER`, `IMD_API_BASE`, `MOSDAC_TOKEN`, `MSG91_AUTH_KEY`, `MSG91_TEMPLATE_ID`, `MSG91_SENDER_ID`, `MSG91_FLOW_URL`, and `TEST_PHONE_NUMBER`.

No secret values are stored in this repository. The production alert provider remains simulation-only.

## What is real, connected, or simulated

| Input or capability | Current default | What that means |
| --- | --- | --- |
| BMC administrative ward geometry | **Connected static snapshot** | 24 real MultiPolygon features in WGS84/EPSG:4326 from DataMeet's Mumbai municipal-spatial-data project, cross-referenced with BMC's 24-ward map. It is not a live BMC GIS feed. |
| IMD weather | **Missing credentials** | IMD is the India-first primary provider. `IMD_API_KEY` and `IMD_STATION_ID` are required. The default local run does not claim IMD data. |
| Weather fallback | **Active demo scenario** | Deterministic Mumbai heat-event exercise data, visibly labelled `DEMO FALLBACK`. It is not an observation or forecast. |
| Census demographics | **Not ingested** | No unsafe join between Census wards, electoral wards and BMC administrative wards is made. Deterministic PVI profiles are visibly labelled as demo fallback. |
| IHIP/NPCCHH outcomes | **Unavailable** | No authorized heat-illness, admission or mortality feed is loaded. Health risk remains a prototype estimate. |
| NCDC/MoHFW guidance | **Reference connected** | Action tasks cite the Summer 2026 advisory and standing heat-health guidance. They are local decision-support translations, not official activation orders. |
| MOSDAC products | **Not integrated** | A source card documents token and product-pipeline requirements. No satellite value is fabricated. |
| SMS | **Simulation only** | Local previews and logs work. A restricted MSG91 test adapter can be enabled for exactly one allow-listed number. |

The complete runtime registry is available at **Data Sources** in the UI and `GET /api/sources`.

## Operational interface

- Dark, dense municipal control room with compact BMC navigation, IST clock, source-state chip and `Ctrl+K` command palette.
- MapLibre map using a single persistent map instance; geometry is fetched once from `/api/map/wards`, cached by the client, and only risk attributes/paint properties are updated.
- 24 BMC ward polygons with full ward codes, broad locality labels, hover values, click selection and a slide-over operational drawer.
- Switchable Risk, HTSI, WBGT, PVI and prototype health-risk layers plus forecast, risk and minimum-PVI filters.
- Ward drawer with calculated drivers, operational response tasks, owner, trigger, rationale, resources and persisted task status.
- Data Sources registry with authority, URL, license, freshness, credentials, fallback and quality notes.
- Auditable system-event stream for initial geometry ingest, provider fallback, source refreshes, alert simulations, provider attempts and response-task changes.
- Alert console with local previews, provider status, explicit test-SMS confirmation and persistent logs.
- Read-only data explorer and a simplified public heat-safety brief.

Routes are lazy-loaded. MapLibre and chart dependencies are split into separately cacheable production chunks.

## Local startup — Windows PowerShell

### 1. Backend

```powershell
cd C:\Users\rohit\OneDrive\Desktop\kodin\heatwave\backend

py -3.11 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements-local.txt
$env:PYTHONPATH = "."
.\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

### 2. Frontend, in a second PowerShell window

```powershell
cd C:\Users\rohit\OneDrive\Desktop\kodin\heatwave\frontend
npm install
npm run dev -- --host 127.0.0.1
```

Open `http://127.0.0.1:5173`. API documentation is at `http://127.0.0.1:8000/docs`.

The upgraded default database is `backend/heatshield_ops.db`. Older prototype databases are not read unless `DATABASE_URL` explicitly selects one.

## IMD provider configuration

Create an account through the official IMD API management portal, obtain the current key transport instructions and identify the required Mumbai station ID. Then start the backend with:

```powershell
cd C:\Users\rohit\OneDrive\Desktop\kodin\heatwave\backend
$env:WEATHER_PROVIDER = "imd"
$env:IMD_API_KEY = "YOUR_PORTAL_KEY"
$env:IMD_STATION_ID = "YOUR_VERIFIED_MUMBAI_STATION_ID"
$env:IMD_API_KEY_HEADER = "x-api-key"
.\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

If the portal issues a different header name, set `IMD_API_KEY_HEADER` accordingly. The provider parses the official city forecast and marks humidity, wind, radiation and ward-scale use as estimated where the station forecast lacks those fields. A station forecast is never presented as a ward sensor.

Official references:

- IMD API portal: <https://api.imd.gov.in/public/index.php>
- IMD API reference: <https://api.imd.gov.in/public/api_reference.html>

## Restricted MSG91 test-SMS configuration

The safe default is `ALERT_PROVIDER=simulation`. To enable one-recipient test mode, use an MSG91 account with an approved sender and DLT-compliant template. The flow template must expose variables named `ward`, `risk` and `advice` to match the adapter payload.

```powershell
cd C:\Users\rohit\OneDrive\Desktop\kodin\heatwave\backend
$env:ALERT_PROVIDER = "msg91"
$env:SMS_TEST_MODE = "true"
$env:TEST_PHONE_NUMBER = "91XXXXXXXXXX"
$env:MSG91_AUTH_KEY = "YOUR_AUTH_KEY"
$env:MSG91_TEMPLATE_ID = "YOUR_APPROVED_FLOW_ID"
$env:MSG91_SENDER_ID = "YOUR_APPROVED_SENDER"
.\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Safeguards are enforced in the backend, not only the UI:

1. Test mode and all credentials must be present.
2. The submitted recipient must exactly match `TEST_PHONE_NUMBER` after normalization.
3. The operator must type `SEND TEST SMS` in the confirmation dialog.
4. Only SMS is supported by the external test adapter.
5. The log reports `ACCEPTED_BY_PROVIDER`, never `DELIVERED`; delivery receipts are not implemented.

MSG91 references: <https://docs.msg91.com/sms> and <https://msg91.com/help/template/how-to-create-flow-id-to-send-sms-via-api>.

## Geospatial data

Bundled file: `backend/data/bmc_administrative_wards.geojson`

- Feature count: 24
- Geometry: MultiPolygon
- CRS: WGS84 / EPSG:4326
- SHA-256 at integration: `F8472EFD6BFD6C845A9D8C540C675EA41C173C03DE61E8475353CD0DC8242F10`
- Source: <https://github.com/datameet/Municipal_Spatial_Data/blob/master/Mumbai/BMC_Wards.geojson>
- Project license: CC BY 4.0
- BMC reference map: <https://portal.mcgm.gov.in/irj/portal/anonymous/BMC-on-Map-Wards-Offices?guest_user=english>

DataMeet explicitly notes that community-cleaned municipal geometry can contain imperfections. Validate the snapshot against current BMC statutory material before regulatory, cadastral or enforcement use.

## Heat action rules

`backend/app/recommendations/rules.py` turns each prototype HTSI band into auditable tasks with:

- severity and responsible owner;
- explicit prototype trigger;
- operational action;
- rationale;
- resource and authorization notes;
- persisted `PENDING`, `ACKNOWLEDGED`, `IN_PROGRESS` or `COMPLETE` state.

Primary guidance references:

- NCDC/MoHFW Summer 2026 advisory: <https://ncdc.mohfw.gov.in/uploads/pdf/1.%20Heat%20wave%20advisory%20for%20State%20Health%20department_2026.pdf>
- NCDC heat-health guidance library: <https://ncdc.mohfw.gov.in/includes/About/CentresAndDivision/CEOH.php>
- IHIP/NPCCHH portal, restricted institutional feed: <https://ihip.mohfw.gov.in/npcchh>

## API surface

| Endpoint | Purpose |
| --- | --- |
| `GET /api/health` | Service, database, primary-provider and alert-mode status |
| `GET /api/system/status` | Component posture and active fallbacks |
| `GET /api/sources` | Complete source/provenance registry |
| `GET /api/events` | Auditable operational event stream |
| `POST /api/system/refresh` | Re-check source posture without silently mutating persisted data |
| `GET /api/map/wards` | Static 24-feature BMC boundary collection |
| `GET /api/wards` | Lightweight selected-day ward metrics; no repeated geometry payload |
| `GET /api/wards/{id}` | Selected-day ward detail with geometry and provenance |
| `GET /api/wards/{id}/forecast` | Six-day ward scenario/forecast layers |
| `GET /api/dashboard/summary` | City posture, forecast rail, alert notes and provenance |
| `GET /api/action-plan/{id}` | Operational tasks and persisted task state |
| `PATCH /api/action-plan/{id}/tasks/{key}` | Advance a response task with audit event |
| `POST /api/alerts/simulate` | Local preview and audit record only |
| `GET /api/alerts/provider` | Simulation/test-SMS gate status |
| `POST /api/alerts/send-test` | Explicitly confirmed, one-recipient MSG91 test request |
| `GET /api/alerts` | Alert simulation/provider-attempt log |
| `POST /api/calculate/thermal-stress` | Direct Heat Index/WBGT/UTCI/HTSI calculation |
| `POST /api/calculate/risk` | Direct thermal plus prototype health-risk calculation |

## Verification

```powershell
cd C:\Users\rohit\OneDrive\Desktop\kodin\heatwave\backend
.\.venv\Scripts\python.exe -m pytest -q

cd ..\frontend
npm run build
```

The backend suite covers geometry count/type, fallback flags, thermal calculations, vulnerability/risk behavior, source registry, action-task fields, local simulation and the external-SMS gate.

## Known limitations

- The bundled boundary snapshot is sourced geometry, not a live official BMC GIS service.
- Default weather, demographics and historical health context are exercise fallbacks. They are not current observations or official ward statistics.
- IMD city/station data cannot provide true ward-scale microclimate. A production system needs calibrated local sensors, exposure models or validated downscaling.
- Direct natural wet-bulb, globe temperature and mean radiant temperature sensors are absent; WBGT and UTCI are estimated from available fields.
- No verified Census-to-BMC administrative-ward crosswalk is loaded.
- No IHIP/NPCCHH patient or facility feed is connected; the system does not fabricate hospitalizations or deaths.
- Action rules support review and coordination but cannot issue a legal BMC order.
- The MSG91 adapter supports one allow-listed test number and provider acceptance only; bulk broadcast, consent lists, rate limiting, webhooks and delivery receipts are intentionally absent.
- The keyless OpenStreetMap raster basemap requires internet access. It is dimmed by the local MapLibre style; ward polygons, labels and risk attributes still load from the local API if raster tiles are unavailable.
