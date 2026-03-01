document.addEventListener('DOMContentLoaded', () => {
    const fileInput = document.getElementById('csv-file');
    const inspectBtn = document.getElementById('inspect-btn');
    const settingsSection = document.getElementById('optimisation-settings');
    const mappingSelects = document.querySelectorAll('.csv-mapping');
    const msg = document.getElementById('message');

    inspectBtn.disabled = true; // Initial state

    fileInput.addEventListener('change', () => {
        if (fileInput.files.length > 0) {
            inspectBtn.disabled = false;
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
            const firstline = content.split('\n')[0];
            const columns = firstline.split(',').map(col => col.trim());

            // Populate the mapping dropdowns
            mappingSelects.forEach(select => {
                select.innerHTML = '<option value="">-- Select Column --</option>';
                columns.forEach((col, index) => {
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
});