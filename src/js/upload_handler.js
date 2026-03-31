document.addEventListener('DOMContentLoaded', () => {
    const fileInput = document.getElementById('csv-file');
    const inspectBtn = document.getElementById('inspect-btn');
    const submitBtn = document.getElementById('btn-submit');
    const settingsSection = document.getElementById('optimisation-settings');
    const mappingSelects = document.querySelectorAll('.csv-mapping');
    const msg = document.getElementById('message');

    let parsedRows = [];
    let headers = [];

    const parseCsvLine = (line) => {
        const values = [];
        let current = '';
        let inQuotes = false;

        for (let i = 0; i < line.length; i++) {
            const char = line[i];

            if (char === '"') {
                const nextChar = line[i + 1];
                if (inQuotes && nextChar === '"') {
                    current += '"';
                    i += 1;
                }
                else {
                    inQuotes = !inQuotes;
                }
                continue;
            }

            if (char === ',' && !inQuotes) {
                values.push(current.trim());
                current = '';
                continue;
            }

            current += char;
        }

        values.push(current.trim());
        return values;
    };

    const getSelectedColumnIndex = (id, required = true) => {
        const value = document.getElementById(id).value;
        if (value === '') {
            return required ? null : -1;
        }
        return Number(value);
    };

    inspectBtn.disabled = true; // Initial state

    fileInput.addEventListener('change', () => {
        if (fileInput.files.length > 0) {
            inspectBtn.disabled = false;
            submitBtn.disabled = false;
            parsedRows = [];
            headers = [];
            settingsSection.style.display = 'none';
            msg.textContent = `File selected: ${fileInput.files[0].name}`;
            msg.style.color = 'blue';
        }
    });

    // Handle the inspection logic
    inspectBtn.addEventListener('click', () => {
        const file = fileInput.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            const content = e.target.result;
            const lines = content
                .split(/\r?\n/)
                .map((line) => line.trim())
                .filter((line) => line.length > 0);

            if (lines.length === 0) {
                msg.textContent = 'The uploaded file is empty.';
                msg.style.color = 'red';
                inspectBtn.disabled = false;
                return;
            }

            headers = parseCsvLine(lines[0]);
            parsedRows = lines.slice(1).map((line) => parseCsvLine(line));

            // Populate the mapping dropdowns
            mappingSelects.forEach(select => {
                select.innerHTML = '<option value="">-- Select Column --</option>';
                headers.forEach((col, index) => {
                    const option = document.createElement('option');
                    option.value = index;
                    option.textContent = col || `Column ${index + 1}`;
                    select.appendChild(option);
                });
            });

            settingsSection.style.display = 'block';
            msg.textContent = 'File inspected successfully. Please configure settings below.';
            msg.style.color = 'green';
        };

        inspectBtn.disabled = true; // Prevent multiple clicks during processing
        reader.readAsText(file);
    });

    submitBtn.addEventListener('click', async () => {
        if (!window.optimisationAPI || typeof window.optimisationAPI.run !== 'function') {
            msg.textContent = 'Optimisation service is unavailable. Please restart the app.';
            msg.style.color = 'red';
            return;
        }

        if (parsedRows.length === 0 || headers.length === 0) {
            msg.textContent = 'Please inspect a CSV file before running optimisation.';
            msg.style.color = 'red';
            return;
        }

        const mapId = getSelectedColumnIndex('map-id');
        const mapLength = getSelectedColumnIndex('map-length');
        const mapTotalLength = getSelectedColumnIndex('map-total-length');
        const mapMaterial = getSelectedColumnIndex('map-material');

        if (mapId === null || mapLength === null || mapTotalLength === null || mapMaterial === null) {
            msg.textContent = 'Please complete all required column mappings.';
            msg.style.color = 'red';
            return;
        }

        const batchNameValue = document.getElementById('batch-name').value.trim();
        const batchName = batchNameValue || `Batch_${new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-')}`;
        const kerfMm = Number(document.getElementById('kerf').value || 0);
        const minRemnantMm = Number(document.getElementById('min-remnant').value || 0);

        const rows = parsedRows.map((row) => ({
            itemNumber: row[mapId],
            length: Number(row[mapLength]),
            totalLength: Number(row[mapTotalLength]),
            nestId: row[mapMaterial]
        })).filter((row) => Number.isFinite(row.length) && row.length > 0 && Number.isFinite(row.totalLength) && row.totalLength > 0);

        if (rows.length === 0) {
            msg.textContent = 'No valid rows found after applying your column mappings.';
            msg.style.color = 'red';
            return;
        }

        submitBtn.disabled = true;
        msg.textContent = 'Running optimisation...';
        msg.style.color = 'blue';

        try {
            const response = await window.optimisationAPI.run({
                batchName,
                kerfMm,
                minRemnantMm,
                priority: document.getElementById('priority').value,
                rows
            });

            if (!response || !response.success) {
                msg.textContent = (response && response.message) || 'Optimisation failed.';
                msg.style.color = 'red';
                return;
            }

            const { summary } = response.runResult;
            msg.textContent = `Optimisation complete. Batch ${response.batchName} saved (ID ${response.batchId}). Total waste: ${summary.totalWastePct}% across ${summary.beams} beam(s).`;
            msg.style.color = 'green';
        }
        catch (err) {
            console.error('Optimisation Run Error:', err);
            msg.textContent = 'An unexpected error occurred during optimisation.';
            msg.style.color = 'red';
        }
        finally {
            submitBtn.disabled = false;
        }
    });
});