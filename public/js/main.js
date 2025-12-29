document.getElementById('urlForm').addEventListener('submit', async function(e) {
    e.preventDefault();

    const originalUrl = document.getElementById('originalUrl').value;
    const submitBtn = document.getElementById('submitBtn');
    const resultDiv = document.getElementById('result');
    const errorDiv = document.getElementById('error');

    resultDiv.classList.add('hidden');
    errorDiv.classList. add('hidden');

    submitBtn.disabled = true;
    submitBtn.textContent = 'Shortening...';

    try {
        const response = await fetch('/shorten', {
            method: 'POST',
            headers:  {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ originalUrl:  originalUrl })
        });

        const data = await response. json();

        if (response.ok) {
            document.getElementById('shortUrl').value = data.shortUrl;
            resultDiv.classList.remove('hidden');
            document.getElementById('originalUrl').value = '';
        } else {
            errorDiv.textContent = 'Error: ' + (data.error || 'Something went wrong');
            errorDiv.classList. remove('hidden');
        }

    } catch (error) {
        console.error('Error:', error);
        errorDiv.textContent = 'Network error. Please try again.';
        errorDiv.classList. remove('hidden');
    }

    submitBtn.disabled = false;
    submitBtn.textContent = 'Shorten ⚡';
});

document.getElementById('copyBtn').addEventListener('click', function() {
    const shortUrl = document.getElementById('shortUrl');
    const copyBtn = document.getElementById('copyBtn');
    const copyMsg = document.getElementById('copyMsg');
    
    shortUrl.select();
    shortUrl.setSelectionRange(0, 99999);
    
    document.execCommand('copy');
    
    copyBtn.textContent = '✅ Copied! ';
    copyMsg.classList.remove('hidden');
    
    setTimeout(function() {
        copyBtn.textContent = '📋 Copy';
        copyMsg.classList.add('hidden');
    }, 2000);
});