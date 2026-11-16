> 🌐 [English](../../constraints.md) | **Bahasa Indonesia**

# AoKira — Batasan Rekayasa & Aturan Eksekusi Agen

**Peran Dokumen:** Guardrail rekayasa wajib, batas arsitektur, invarian simulasi, aturan kebersihan Git, dan protokol eksekusi otonom yang mengatur seluruh sesi implementasi (termasuk Claude Code). Pelanggaran akan menggagalkan gerbang validasi phase di [flow.md](flow.md).

---

## 1. Arsitektur & Batas Subsistem

1. **Frontend (`apps/web`) Hanya Memegang Rendering & Orkestrasi**:
   - Jangan pernah mengimplementasikan ulang forward kinematics DH, inverse kinematics DLS, pembangkitan trajektori quintic, atau matematika tabrakan di TypeScript. Seluruh kebenaran gerak dan tabrakan berasal dari `crates/aokira-engine`.
   - Jangan pernah menjalankan tick simulasi (`step_tick`) di thread UI utama; jalankan seluruh simulasi WASM di dalam `simulation.worker.ts`.
   - Jangan pernah memicu render ulang state React di dalam loop `useFrame` Three.js; perbarui transform objek 3D lewat ref yang dapat diubah / subscription transien dari `SimulationSnapshot`.
2. **Engine Rust (`crates/aokira-engine`) Hanya Memegang Simulasi Deterministik**:
   - Jaga isolasi ketat dari DOM, `window`, jam browser, atau klien HTTP.
   - Jangan pernah melakukan panic melintasi batas FFI `wasm-bindgen` (`unwrap()`/`expect()` dilarang pada input eksternal atau jalur konvergensi solver; kembalikan `Result` / `FaultCode` bertipe).
3. **Layanan Python (`apps/api`) Hanya Memegang Analytics Batch & Optimasi**:
   - Tetap sepenuhnya stateless antar request HTTP.
   - Jangan pernah menjadi dependensi runtime untuk memulai, menjalankan langkah, atau memeriksa simulasi pick-and-place 3D.
4. **Sumber Kebenaran Tunggal**:
   - Muat semua dimensi link robot, parameter DH, batas sendi, primitif tabrakan, dan koordinat stasiun dari `data/workcell/aokira-workcell.v1.json`. Menduplikasi konstanta koordinat yang saling bersaing di berbagai file dilarang.

---

## 2. Invarian Kebenaran Simulasi & Determinisme

1. **Jam Deterministik**: Waktu simulasi maju hanya dalam langkah tetap bilangan bulat `20 ms` (`timestepMs = 20`). Interval frame browser (`dt`) hanya boleh menentukan *berapa banyak* tick tetap `20 ms` yang dikelompokkan (dibatasi `<= 200 ms` per frame), tidak pernah ukuran langkah integrasi fisika/gerak itu sendiri.
2. **IK Tidak Berarti Bebas Tabrakan**: Konvergensi inverse kinematics hanya memvalidasi keterjangkauan pose di dalam batas sendi. Deteksi tabrakan (modul `collision`) harus berjalan secara independen untuk trajektori yang direncanakan dan pada setiap tick simulasi.
3. **Fault Eksplisit, Bukan Clamping Diam-diam**: Target Cartesian yang tidak terjangkau atau pelanggaran batas sendi harus mengembalikan `UNREACHABLE_TARGET` atau `JOINT_LIMIT_VIOLATION` tanpa merusak state sendi yang sedang berjalan. Jangan pernah meng-clamp target tidak valid secara diam-diam menjadi pose pendekatan yang salah selama IK.
4. **Metrik Hanya Dari Event**: Setiap KPI di `Overview`, `Performance Analytics`, dan `Optimization Center` harus dapat ditelusuri ke `SimulationEvent[]` dan integral energi per tick yang kumulatif. KPI placeholder yang di-hardcode, statis, atau acak sangat dilarang.
5. **Tanpa Imitasi OEM & Tanpa Fiksi Termal**: Pertahankan geometri robot 6 sumbu generik yang didefinisikan di [SIMULATION_SPEC.md](SIMULATION_SPEC.md). Jangan pernah memperkenalkan simulasi termal atau kinematika robot yang meniru merek.

---

## 3. Konvensi Pengodean & Standar Kualitas

- **TypeScript (`apps/web`)**:
  - `"strict": true`, `"noUnusedLocals": true`, `"noUnusedParameters": true`, tanpa tipe `any` pada batas modul.
  - Gunakan token Tailwind yang didefinisikan di [DESIGN.md](DESIGN.md); terapkan `tabular-nums` pada pembacaan numerik.
- **Rust (`crates/aokira-engine`)**:
  - Harus lolos `cargo fmt --check` dan `cargo clippy --all-targets -- -D warnings`.
  - Jaga modul matematika tetap murni, deterministik (`f64` secara internal), dan diuji unit secara independen dari `wasm-bindgen`.
- **Python (`apps/api`)**:
  - Anotasi tipe Python `3.12+` wajib di mana pun; model Pydantic v2 harus mencerminkan [DATA_MODEL.md](DATA_MODEL.md) dan [API_CONTRACT.md](API_CONTRACT.md) dengan alias JSON `camelCase`.
  - Validasi float yang finit (`allow_nan=False` / penolakan eksplisit terhadap `NaN`/`Infinity`).
  - Lolos `ruff check` dan `pytest` dengan bersih.
- **Kebersihan Kode Umum**:
  - Jangan menduplikasi logika antar modul; ekstrak helper bersama dengan rapi.
  - Pertahankan komentar dan dokumentasi yang tidak terkait kecuali digantikan oleh spesifikasi yang diperbarui.

---

## 4. Perlindungan Cakupan & Jalan Pintas Terlarang

- **Perluasan Cakupan yang Dilarang Secara Eksplisit**: Jangan mengimplementasikan autentikasi/login, pembayaran, database multi-pengguna, bridge PLC/OPC-UA/ROS 2, fisika rigid-body umum, unduhan CAD OEM, atau telemetri pabrik langsung.
- **Disclaimer Wajib**: Jangan pernah mengklaim atau menyiratkan bahwa `AoKira` adalah perangkat lunak kontrol robot tersertifikasi, perangkat lunak keselamatan ISO, atau perangkat keras pengukur listrik sungguhan.
- **Jalan Pintas Rekayasa yang Dilarang**:
  - Tidak ada trik timing async berbasis `sleep` di tes atau loop simulasi.
  - Tidak ada tes penerimaan yang di-skip (`test.skip` / `@pytest.mark.skip` / `#[ignore]`) demi membuat build tampak hijau.
  - Tidak ada file sumber placeholder kosong yang dibuat semata-mata untuk meniru struktur direktori sebelum pekerjaan phase yang sebenarnya.
  - Jangan pernah melaporkan tes atau anggaran performa sebagai lulus/terpenuhi kecuali benar-benar dijalankan setelah edit terakhir dengan semua kasus lulus.

---

## 5. Alur Kerja Git & Aturan Keamanan

1. **Commit Tervalidasi yang Granular**: Commit unit kecil yang lengkap secara logis setelah memverifikasi build/tes/lint lulus (memakai Conventional Commits: `feat:`, `fix:`, `docs:`, `test:`, `chore:`).
2. **Staging File Eksplisit**: Jangan pernah menjalankan `git add -A` atau `git add .` secara buta ketika ada file lokal yang belum dilacak atau artefak OS (`.DS_Store`, `.env`); lakukan staging pada path yang eksplisit.
3. **Jangan Pernah Commit Artefak Sensitif atau Hasil Generate**: Jangan pernah commit `.env`, API key, token, `node_modules/`, `target/`, `pkg/`, atau keluaran build.
4. **Operasi Git yang Dilarang**:
   - Jangan pernah menjalankan perintah destruktif (`git reset --hard`, `git clean -fd`, `git checkout --` pada edit pengguna).
   - Jangan pernah force-push (`git push --force`).
   - **Jangan pernah push ke GitHub (`git push`) atau mengubah remote tanpa otorisasi eksplisit dari pengguna.**

---

## 6. Pemeliharaan Dokumentasi & Aturan Agen Otonom

1. **Dokumen Kanonis Lebih Dulu**: Jika implementasi menemukan perubahan yang diperlukan pada konstanta kinematik, field payload API, atau tipe data, perbarui dokumen kanonis tunggal (`SIMULATION_SPEC.md`, `API_CONTRACT.md`, atau `DATA_MODEL.md`) lebih dulu atau bersamaan dengan perubahan kode agar dokumen tidak menyimpang.
2. **Cakupan Eksekusi Otonom**: Agen implementasi (misalnya Claude Code) boleh memutuskan sendiri refactoring modul internal, tata letak helper, micro-copy UI, dan struktur unit test di dalam spesifikasi yang terkunci.
3. **Pemicu Eskalasi Wajib**: Berhenti dan tanyakan kepada pengguna **hanya** ketika sebuah keputusan akan secara material mengubah cakupan produk, mengubah identitas merek `AoKira`, menyimpang dari arsitektur 3 tier `TypeScript + Rust/WASM + Python/FastAPI`, memodifikasi konfigurasi Git remote, atau melakukan push/deploy ke produksi.
