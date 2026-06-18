(function() {
    'use strict';

    // ============================================
    // API CONFIGURATION
    // ============================================
    const API = {
        forecast: 'https://api.open-meteo.com/v1/forecast',
        nominatim: 'https://nominatim.openstreetmap.org/search'
    };

    const REFRESH_INTERVAL = 30 * 60 * 1000; // 30 minutes

    // ============================================
    // STATE MANAGEMENT
    // ============================================
    let state = {
        lang: 'en',
        focused: null,
        searchTimer: null,
        keyboardIndex: -1,
        searchResults: [],
        recentSearches: [],
        autoRefreshTimer: null
    };

    // Load language preference
    try {
        const savedLang = localStorage.getItem('nepalsky_lang');
        if (savedLang === 'ne' || savedLang === 'en') {
            state.lang = savedLang;
        }
    } catch(e) {}

    // Load recent searches from localStorage
    try {
        const stored = localStorage.getItem('nepalsky_recent');
        state.recentSearches = stored ? JSON.parse(stored) : [];
    } catch(e) {
        state.recentSearches = [];
    }

    // ============================================
    // DOM HELPERS
    // ============================================
    const getEl = (id) => document.getElementById(id);
    
    const setText = (id, value) => {
        const el = getEl(id);
        if (el && value !== undefined && value !== null) {
            el.textContent = value;
        }
    };

    // ============================================
    // WEATHER CODES (WMO)
    // ============================================
    function getWMODescription(code) {
        const codes = {
            0: { en: 'Clear sky', ne: 'सफा आकाश', icon: '☀️' },
            1: { en: 'Mainly clear', ne: 'मुख्यतया सफा', icon: '🌤️' },
            2: { en: 'Partly cloudy', ne: 'आंशिक बादल', icon: '⛅' },
            3: { en: 'Overcast', ne: 'बादल', icon: '☁️' },
            45: { en: 'Foggy', ne: 'कुहिरो', icon: '🌫️' },
            48: { en: 'Depositing rime fog', ne: 'तुषारो', icon: '🌫️' },
            51: { en: 'Light drizzle', ne: 'हल्का झरी', icon: '🌦️' },
            53: { en: 'Moderate drizzle', ne: 'मध्यम झरी', icon: '🌦️' },
            55: { en: 'Dense drizzle', ne: 'घना झरी', icon: '🌧️' },
            61: { en: 'Slight rain', ne: 'हल्का वर्षा', icon: '🌦️' },
            63: { en: 'Moderate rain', ne: 'मध्यम वर्षा', icon: '🌧️' },
            65: { en: 'Heavy rain', ne: 'भारी वर्षा', icon: '🌧️' },
            71: { en: 'Slight snow', ne: 'हल्का हिमपात', icon: '🌨️' },
            73: { en: 'Moderate snow', ne: 'मध्यम हिमपात', icon: '🌨️' },
            75: { en: 'Heavy snow', ne: 'भारी हिमपात', icon: '❄️' },
            80: { en: 'Slight rain showers', ne: 'हल्का छिटपुट वर्षा', icon: '🌦️' },
            81: { en: 'Moderate rain showers', ne: 'मध्यम छिटपुट वर्षा', icon: '🌧️' },
            82: { en: 'Violent rain showers', ne: 'तेज छिटपुट वर्षा', icon: '⛈️' },
            95: { en: 'Thunderstorm', ne: 'मेघगर्जन', icon: '⛈️' },
            96: { en: 'Thunderstorm with slight hail', ne: 'असिना सहित मेघगर्जन', icon: '⛈️' },
            99: { en: 'Thunderstorm with heavy hail', ne: 'ठूलो असिना सहित मेघगर्जन', icon: '⛈️' }
        };
        return codes[code] || { en: 'Variable', ne: 'परिवर्तनशील', icon: '🌤️' };
    }

    function getIcon(code) {
        return getWMODescription(code).icon;
    }

    function getWeatherName(code, lang) {
        const wmo = getWMODescription(code);
        return lang === 'ne' ? wmo.ne : wmo.en;
    }

    // ============================================
    // LANGUAGE STRINGS
    // ============================================
    const L = {
        ne: {
            searchPh: 'शहर, जिल्ला, नगरपालिका खोज्नुहोस्...',
            searchHint: '"काठमाडौं", "पोखरा", "धरान" प्रयास गर्नुहोस्',
            findPlace: 'आफ्नो स्थान खोज्नुहोस्',
            searchPlaces: 'शहर, जिल्ला, नगरपालिकाको नाम लेख्नुहोस्',
            useLocation: '📍 मेरो स्थान प्रयोग गर्नुहोस्',
            clearSearch: '✕ खोजी हटाउनुहोस्',
            recentLabel: 'हालै खोजिएको',
            clearAll: 'सबै हटाउनुहोस्',
            throughDay: 'दिनभरिको अवस्था',
            hourlyTitle: 'प्रति घण्टा पूर्वानुमान',
            simpleTitle: 'सरल भाषामा मौसम',
            morning: 'बिहान',
            afternoon: 'दिउँसो',
            night: 'राती',
            tomorrow: 'भोलि',
            veryHot: 'निकै गर्मी',
            hot: 'गर्मी',
            comfortable: 'सहज',
            cool: 'चिसो',
            cold: 'धेरै चिसो',
            condition: 'अवस्था',
            rainLabel: 'वर्षा',
            windLabel: 'हावा',
            humidityLabel: 'आर्द्रता',
            high: 'अधिकतम',
            low: 'न्यूनतम',
            feelsLike: 'अनुभूति',
            todaySummary: 'आज',
            tomorrowSummary: 'भोलि',
            day3Summary: 'पर्सि',
            clear: 'सफा',
            rainLikely: 'वर्षा सम्भावित',
            cloudy: 'बादल',
            rainExpected: 'वर्षा निश्चित',
            possibleShowers: 'छिटपुट वर्षा',
            dryWarm: 'सुख्खा र गर्मी',
            rainContinues: 'वर्षा जारी',
            coldNight: 'चिसो रात',
            coolEvening: 'शीतल साँझ',
            mostlyClear: 'प्रायः सफा',
            partlyCloudy: 'आंशिक बादल',
            strongWind: 'तेज हावा',
            moderateBreeze: 'मध्यम हावा',
            lightBreeze: 'हल्का हावा',
            calm: 'शान्त',
            heavyRain: 'भारी वर्षा',
            moderateRain: 'मध्यम वर्षा',
            lightRain: 'हल्का वर्षा',
            noRain: 'पानी छैन'
        },
        en: {
            searchPh: 'Search city, district, municipality...',
            searchHint: 'Try "Kathmandu", "Pokhara", or "Dharan"',
            findPlace: 'Find your Place',
            searchPlaces: 'Enter a city, district, or municipality name',
            useLocation: '📍 Use My Current Location',
            clearSearch: '✕ Clear Search',
            recentLabel: 'Recently searched',
            clearAll: 'Clear all',
            throughDay: 'Through the Day',
            hourlyTitle: 'Hourly Forecast',
            simpleTitle: 'Weather in Simple Words',
            morning: 'Morning',
            afternoon: 'Afternoon',
            night: 'Night',
            tomorrow: 'Tomorrow',
            veryHot: 'Very hot',
            hot: 'Warm',
            comfortable: 'Comfortable',
            cool: 'Cool',
            cold: 'Cold',
            condition: 'Condition',
            rainLabel: 'Rain',
            windLabel: 'Wind',
            humidityLabel: 'Humidity',
            high: 'High',
            low: 'Low',
            feelsLike: 'Feels like',
            todaySummary: 'Today',
            tomorrowSummary: 'Tomorrow',
            day3Summary: 'Day 3',
            clear: 'Clear',
            rainLikely: 'Rain likely',
            cloudy: 'Cloudy',
            rainExpected: 'Rain expected',
            possibleShowers: 'Possible showers',
            dryWarm: 'Dry & warm',
            rainContinues: 'Rain continues',
            coldNight: 'Cold night',
            coolEvening: 'Cool evening',
            mostlyClear: 'Mostly clear',
            partlyCloudy: 'Partly cloudy',
            strongWind: 'Strong wind',
            moderateBreeze: 'Moderate breeze',
            lightBreeze: 'Light breeze',
            calm: 'Calm',
            heavyRain: 'Heavy rain',
            moderateRain: 'Moderate rain',
            lightRain: 'Light rain',
            noRain: 'No rain'
        }
    };

    function t(key) {
        return L[state.lang][key] || key;
    }

    // ============================================
    // UTILITY FUNCTIONS
    // ============================================
    async function fetchJSON(url) {
        try {
            const r = await fetch(url);
            if (!r.ok) throw new Error('HTTP ' + r.status);
            return await r.json();
        } catch(e) {
            console.error('Fetch error:', e.message);
            return null;
        }
    }

    function getComfort(temp) {
        if (temp > 35) return t('veryHot');
        if (temp > 28) return t('hot');
        if (temp > 20) return t('comfortable');
        if (temp > 10) return t('cool');
        return t('cold');
    }

    function formatTime(ts) {
        if (!ts) return '--:--';
        const d = new Date(ts);
        return d.toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: true
        });
    }

    function getWindDesc(speed) {
        if (speed > 8) return t('strongWind');
        if (speed > 4) return t('moderateBreeze');
        if (speed > 1) return t('lightBreeze');
        return t('calm');
    }

    function getRainDesc(amount) {
        if (amount > 10) return t('heavyRain') + ' (' + amount.toFixed(1) + 'mm)';
        if (amount > 3) return t('moderateRain') + ' (' + amount.toFixed(1) + 'mm)';
        if (amount > 0) return t('lightRain') + ' (' + amount.toFixed(1) + 'mm)';
        return t('noRain');
    }

    // ============================================
    // GEOLOCATION
    // ============================================
    async function getUserLoc() {
        return new Promise((resolve) => {
            if (!navigator.geolocation) {
                alert('Geolocation is not supported by your browser.');
                resolve(null);
                return;
            }
            navigator.geolocation.getCurrentPosition(
                (p) => resolve({ lat: p.coords.latitude, lon: p.coords.longitude }),
                (err) => {
                    if (err.code === 1) {
                        alert('Location access denied. Please enable location or search manually.');
                    } else {
                        alert('Location unavailable. Please search manually.');
                    }
                    resolve(null);
                },
                { enableHighAccuracy: true, timeout: 10000, maximumAge: 300000 }
            );
        });
    }

    // ============================================
    // AUTO REFRESH
    // ============================================
    function startAutoRefresh() {
        if (state.autoRefreshTimer) clearInterval(state.autoRefreshTimer);
        state.autoRefreshTimer = setInterval(() => {
            if (state.focused) {
                loadForecast(state.focused.lat, state.focused.lon, state.focused.name, true);
            }
        }, REFRESH_INTERVAL);
    }

    // ============================================
    // RECENT SEARCHES
    // ============================================
    function saveRecent(name, lat, lon) {
        state.recentSearches = state.recentSearches.filter(s => s.name !== name);
        state.recentSearches.unshift({ name, lat, lon });
        if (state.recentSearches.length > 5) state.recentSearches.pop();
        try {
            localStorage.setItem('nepalsky_recent', JSON.stringify(state.recentSearches));
        } catch(e) {}
        renderRecentChips();
    }

    function clearRecent() {
        state.recentSearches = [];
        try {
            localStorage.removeItem('nepalsky_recent');
        } catch(e) {}
        renderRecentChips();
    }

    function renderRecentChips() {
        const section = getEl('searchRecentSection');
        const chips = getEl('recentChips');
        if (!section || !chips) return;
        
        if (!state.recentSearches.length) {
            section.style.display = 'none';
            return;
        }
        
        section.style.display = 'block';
        chips.innerHTML = state.recentSearches.map(s =>
            `<span class="recent-chip" data-lat="${s.lat}" data-lon="${s.lon}" data-name="${s.name}">📍 ${s.name}</span>`
        ).join('');
        
        chips.querySelectorAll('.recent-chip').forEach(chip => {
            chip.addEventListener('click', (e) => {
                e.stopPropagation();
                const lat = parseFloat(chip.dataset.lat);
                const lon = parseFloat(chip.dataset.lon);
                const name = chip.dataset.name;
                loadForecast(lat, lon, name);
                hideSearchResults();
            });
        });
    }

    // ============================================
    // USE LOCATION BUTTON
    // ============================================
    function updateUseLocBtn() {
        const btn = getEl('btnUseLocation');
        if (!btn) return;
        
        if (state.focused) {
            btn.textContent = t('clearSearch');
            btn.onclick = () => {
                state.focused = null;
                if (state.autoRefreshTimer) clearInterval(state.autoRefreshTimer);
                const dashContent = getEl('dashContent');
                const emptyState = getEl('emptyState');
                if (dashContent) dashContent.style.display = 'none';
                if (emptyState) emptyState.style.display = 'block';
                updateUseLocBtn();
            };
        } else {
            btn.textContent = t('useLocation');
            btn.onclick = async () => {
                const loc = await getUserLoc();
                if (loc) {
                    saveRecent('My Location', loc.lat, loc.lon);
                    await loadForecast(loc.lat, loc.lon, 'My Location');
                }
            };
        }
    }

    // ============================================
    // SEARCH FUNCTIONALITY
    // ============================================
    async function searchLocations(query) {
        if (!query || query.length < 2) {
            hideSearchResults();
            return;
        }
        
        state.keyboardIndex = -1;
        showSearchLoading();
        
        try {
            const url = `${API.nominatim}?q=${encodeURIComponent(query)},+Nepal&format=json&limit=10&countrycodes=np&addressdetails=1`;
            const data = await fetchJSON(url);
            
            if (!data || !data.length) {
                showSearchEmpty();
                return;
            }
            
            state.searchResults = data.slice(0, 8);
            renderSearchResults(state.searchResults);
        } catch(e) {
            showSearchError();
        }
    }

    function showSearchLoading() {
        const panel = getEl('searchResults');
        if (panel) {
            panel.classList.add('active');
            panel.innerHTML = '<div class="search-loading">Searching...</div>';
        }
        const spinner = getEl('searchSpinner');
        if (spinner) spinner.style.display = 'block';
    }

    function showSearchEmpty() {
        const panel = getEl('searchResults');
        if (panel) {
            panel.classList.add('active');
            panel.innerHTML = '<div class="search-empty">No locations found</div>';
        }
        const spinner = getEl('searchSpinner');
        if (spinner) spinner.style.display = 'none';
    }

    function showSearchError() {
        const panel = getEl('searchResults');
        if (panel) {
            panel.classList.add('active');
            panel.innerHTML = '<div class="search-error">Search unavailable</div>';
        }
        const spinner = getEl('searchSpinner');
        if (spinner) spinner.style.display = 'none';
    }

    function hideSearchResults() {
        const panel = getEl('searchResults');
        if (panel) panel.classList.remove('active');
        const spinner = getEl('searchSpinner');
        if (spinner) spinner.style.display = 'none';
    }

    function renderSearchResults(results) {
        const panel = getEl('searchResults');
        if (!panel) return;
        
        panel.classList.add('active');
        const spinner = getEl('searchSpinner');
        if (spinner) spinner.style.display = 'none';
        
        const recentSection = getEl('searchRecentSection');
        if (recentSection) recentSection.style.display = 'none';
        
        panel.innerHTML = results.map((d, i) => {
            const name = d.display_name.split(',')[0].trim();
            const detail = d.display_name.split(',').slice(1, 3).join(', ').trim();
            return `<div class="search-result-item" data-index="${i}" data-lat="${d.lat}" data-lon="${d.lon}" data-name="${name}">
                <span class="search-result-icon">📍</span>
                <div class="search-result-info">
                    <div class="search-result-name">${name}</div>
                    <div class="search-result-detail">${detail}</div>
                </div>
            </div>`;
        }).join('');
        
        panel.querySelectorAll('.search-result-item').forEach(item => {
            item.addEventListener('click', () => selectLocation(item));
        });
    }

    function selectLocation(item) {
        const lat = parseFloat(item.dataset.lat);
        const lon = parseFloat(item.dataset.lon);
        const name = item.dataset.name;
        
        const searchInput = getEl('searchInput');
        if (searchInput) searchInput.value = name;
        
        hideSearchResults();
        saveRecent(name, lat, lon);
        
        try {
            localStorage.setItem('nepalsky_last_location', JSON.stringify({ name, lat, lon }));
        } catch(e) {}
        
        loadForecast(lat, lon, name);
    }

    // ============================================
    // FORECAST LOADING
    // ============================================
    async function loadForecast(lat, lon, name, silent = false) {
        const params = new URLSearchParams({
            latitude: lat,
            longitude: lon,
            daily: 'weather_code,temperature_2m_max,temperature_2m_min,apparent_temperature_max,precipitation_sum,precipitation_probability_max,wind_speed_10m_max,relative_humidity_2m_max,sunrise,sunset',
            hourly: 'temperature_2m,weather_code,precipitation,relative_humidity_2m,wind_speed_10m,apparent_temperature',
            timezone: 'Asia/Kathmandu',
            forecast_days: 3
        });

        const data = await fetchJSON(`${API.forecast}?${params}`);
        
        if (!data || !data.daily) {
            if (!silent) alert('No forecast data available.');
            return;
        }

        // Transform daily data with current language
        const daily = data.daily.time.map((date, i) => ({
            datetime: date,
            weather_name: getWeatherName(data.daily.weather_code[i], state.lang),
            weather_code: data.daily.weather_code[i],
            max_temperature: data.daily.temperature_2m_max[i],
            min_temperature: data.daily.temperature_2m_min[i],
            heat_index: data.daily.apparent_temperature_max[i],
            relative_humidity: data.daily.relative_humidity_2m_max[i],
            wind_speed: data.daily.wind_speed_10m_max[i],
            accumulated_precipitation: data.daily.precipitation_sum[i],
            precipitation_probability: data.daily.precipitation_probability_max[i] || 0,
            sunrise: data.daily.sunrise[i],
            sunset: data.daily.sunset[i]
        }));

        // Transform hourly data with current language
        const hourly = data.hourly.time.map((time, i) => ({
            datetime: time,
            air_temperature: data.hourly.temperature_2m[i],
            weather_name: getWeatherName(data.hourly.weather_code[i], state.lang),
            weather_code: data.hourly.weather_code[i],
            hourly_precipitation: data.hourly.precipitation[i],
            relative_humidity: data.hourly.relative_humidity_2m[i],
            wind_speed: data.hourly.wind_speed_10m[i],
            heat_index: data.hourly.apparent_temperature[i]
        }));

        state.focused = {
            name,
            lat,
            lon,
            daily,
            hourly,
            display_name: name,
            province: ''
        };

        renderAll();
        updateUseLocBtn();
        startAutoRefresh();
        
        if (!silent) {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
    }

    // ============================================
    // RENDERING
    // ============================================
    function updateLabels() {
        const searchInput = getEl('searchInput');
        if (searchInput) searchInput.placeholder = t('searchPh');
        
        const hint = getEl('searchHint');
        if (hint) hint.textContent = t('searchHint');
        
        const emptyState = getEl('emptyState');
        if (emptyState) {
            const h3 = emptyState.querySelector('h3');
            const p = emptyState.querySelector('p');
            if (h3) h3.textContent = t('findPlace');
            if (p) p.textContent = t('searchPlaces');
        }
        
        updateUseLocBtn();
        
        const titles = document.querySelectorAll('.section-title');
        if (titles.length >= 3) {
            titles[0].textContent = t('throughDay');
            titles[1].textContent = t('hourlyTitle');
            titles[2].textContent = t('simpleTitle');
        }
        
        const whLabels = document.querySelectorAll('.wh-metric-label');
        if (whLabels.length >= 4) {
            whLabels[0].textContent = t('condition');
            whLabels[1].textContent = t('rainLabel');
            whLabels[2].textContent = t('windLabel');
            whLabels[3].textContent = t('humidityLabel');
        }
    }

    function renderAll() {
        const s = state.focused;
        if (!s) return;

        // Show dashboard, hide empty state
        const emptyState = getEl('emptyState');
        const dashContent = getEl('dashContent');
        if (emptyState) emptyState.style.display = 'none';
        if (dashContent) dashContent.style.display = 'block';

        updateLabels();

        const today = s.daily[0];
        const locName = s.display_name || s.name;
        const maxT = today.max_temperature;
        const minT = today.min_temperature;
        const hum = today.relative_humidity;
        const wind = today.wind_speed;
        const precipProb = today.precipitation_probability;
        const wName = today.weather_name;
        const wCode = today.weather_code;
        const heatIdx = today.heat_index;
        const sunrise = today.sunrise;
        const sunset = today.sunset;

        // Update weather hero
        setText('whLocation', locName);
        setText('whProvince', '');
        setText('whTemp', Math.round(maxT) + '°');
        setText('whHigh', Math.round(maxT) + '°');
        setText('whLow', Math.round(minT) + '°');
        setText('whFeels', t('feelsLike') + ' ' + Math.round(heatIdx) + '°');
        setText('whCondition', wName);
        setText('whRain', Math.round(precipProb) + '%');
        setText('whWind', wind.toFixed(1) + ' m/s');
        setText('whHumidity', Math.round(hum) + '%');
        setText('whSunrise', formatTime(sunrise));
        setText('whSunset', formatTime(sunset));
        setText('whAdvice', '💡 ' + getComfort(Math.round(maxT)));

        // Update icon
        const whIcon = getEl('whIcon');
        if (whIcon) whIcon.textContent = getIcon(wCode);

        // Update background
        const bg = getEl('whBg');
        if (bg) {
            bg.className = 'wh-bg';
            const hr = new Date().getHours();
            if (wCode >= 95) bg.classList.add('storm');
            else if (wCode >= 61) bg.classList.add('rain');
            else if (wCode >= 2) bg.classList.add('cloudy');
            else if (maxT > 35) bg.classList.add('hot');
            else if (maxT < 10) bg.classList.add('cold');
            else if (hr < 6 || hr > 18) bg.classList.add('night');
            else bg.classList.add('clear');
        }

        // Timeline cards
        const tr = Math.min(100, Math.max(5, Math.round(precipProb + (Math.random() * 20 - 10))));
        const tmp = Math.round(maxT);
        const timelineGrid = getEl('timelineGrid');
        if (timelineGrid) {
            timelineGrid.innerHTML = [
                {
                    l: t('morning'),
                    i: precipProb > 50 ? '🌧️' : '☁️',
                    tm: '6AM–12PM',
                    d: precipProb < 30 ? t('clear') : precipProb > 60 ? t('rainLikely') : t('cloudy')
                },
                {
                    l: t('afternoon'),
                    i: precipProb > 60 ? '⛈️' : precipProb > 30 ? '🌦️' : '☀️',
                    tm: '12PM–6PM',
                    d: precipProb > 60 ? t('rainExpected') : precipProb > 30 ? t('possibleShowers') : t('dryWarm')
                },
                {
                    l: t('night'),
                    i: precipProb > 45 ? '🌧️' : '🌆',
                    tm: '6PM–12AM',
                    d: precipProb > 45 ? t('rainContinues') : tmp < 10 ? t('coldNight') : t('coolEvening')
                },
                {
                    l: t('tomorrow'),
                    i: tr > 50 ? '🌧️' : tr > 30 ? '🌤️' : '☀️',
                    tm: '12AM–12PM',
                    d: tr > 50 ? t('rainExpected') : tr > 30 ? t('partlyCloudy') : t('mostlyClear')
                }
            ].map(b => `
                <div class="tl-card">
                    <div class="tl-icon">${b.i}</div>
                    <div class="tl-period">${b.l}</div>
                    <div class="tl-time">${b.tm}</div>
                    <div class="tl-desc">${b.d}</div>
                </div>
            `).join('');
        }

        // Hourly forecast
        const hourly = s.hourly || [];
        const currentHour = new Date();
        const future = hourly.filter(h => new Date(h.datetime) >= currentHour);
        const display = future.length > 0 ? future : hourly.slice(-24);
        
        const hWrap = getEl('hourlyWrap');
        if (hWrap && display.length) {
            const groups = {};
            display.forEach(h => {
                const d = new Date(h.datetime);
                const key = state.lang === 'ne'
                    ? d.toLocaleDateString('ne-NP', { weekday: 'long', day: 'numeric', month: 'short' })
                    : d.toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'short' });
                if (!groups[key]) groups[key] = [];
                groups[key].push(h);
            });

            let hhtml = '';
            for (const [dayLabel, hours] of Object.entries(groups)) {
                hhtml += `<div class="hourly-day-label">${dayLabel}</div><div class="hourly-row-flex">`;
                hours.forEach(hh => {
                    const time = new Date(hh.datetime).toLocaleTimeString('en-US', {
                        hour: '2-digit',
                        minute: '2-digit',
                        hour12: true
                    });
                    const hRain = hh.hourly_precipitation || 0;
                    const rainStr = hRain > 0 ? hRain.toFixed(1) + 'mm' : '—';
                    hhtml += `
                        <div class="hourly-card">
                            <div class="hourly-time">${time}</div>
                            <div class="hourly-icon">${getIcon(hh.weather_code)}</div>
                            <div class="hourly-temp">${Math.round(hh.air_temperature)}°</div>
                            <div class="hourly-rain">${rainStr}</div>
                        </div>
                    `;
                });
                hhtml += '</div>';
            }
            hWrap.innerHTML = hhtml;
        }

        // Simple words summary
        const tD = s.daily[0];
        const tmD = s.daily[1] || tD;
        const d3D = s.daily[2] || tmD;

        function daySummary(dd, label) {
            const mx = Math.round(dd.max_temperature || 25);
            const mn = Math.round(dd.min_temperature || 20);
            const hm = Math.round(dd.relative_humidity || 50);
            const wd = dd.wind_speed || 0;
            const rn = dd.accumulated_precipitation || 0;
            const hi = Math.round(dd.heat_index || mx);
            return `<strong>${label}:</strong> ${dd.weather_name}<br>🌡️ ${mn}°C – ${mx}°C (${t('feelsLike')} ${hi}°C) — ${getComfort(mx)}<br>💧 ${t('humidityLabel')}: ${hm}%<br>💨 ${t('windLabel')}: ${getWindDesc(wd)} (${wd.toFixed(1)} m/s)<br>🌧️ ${t('rainLabel')}: ${getRainDesc(rn)}`;
        }

        const text = `📍 <strong>${locName}</strong><br><br>${daySummary(tD, t('todaySummary'))}<br><br>${daySummary(tmD, t('tomorrowSummary'))}<br><br>${daySummary(d3D, t('day3Summary'))}`;
        
        const sw = getEl('simpleWordsNew');
        if (sw) {
            sw.innerHTML = `
                <div class="sw-card">
                    <h4>${state.lang === 'ne' ? '🇳🇵 नेपाली मौसम' : '🇬🇧 English Weather'}</h4>
                    <p${state.lang === 'ne' ? ' class="np"' : ''}>${text.replace(/\n/g, '<br>')}</p>
                </div>
            `;
        }
    }

    // ============================================
    // INITIALIZATION
    // ============================================
    function init() {
        // Priority 1: Check for direct navigation from landing page
        try {
            const directCity = localStorage.getItem('nepalsky_direct_city');
            if (directCity) {
                const city = JSON.parse(directCity);
                localStorage.removeItem('nepalsky_direct_city');
                
                const searchInput = getEl('searchInput');
                if (searchInput) searchInput.value = city.name;
                
                setTimeout(() => {
                    loadForecast(city.lat, city.lon, city.name);
                }, 200);
                
                setupUI();
                return;
            }
        } catch(e) {
            console.error('Error reading direct city:', e);
        }

        // Normal initialization
        setupUI();

        // Load last known location
        try {
            const saved = localStorage.getItem('nepalsky_last_location');
            if (saved) {
                const loc = JSON.parse(saved);
                const searchInput = getEl('searchInput');
                if (searchInput) searchInput.value = loc.name;
                loadForecast(loc.lat, loc.lon, loc.name);
            }
        } catch(e) {
            console.error('Error loading last location:', e);
        }
    }

    function setupUI() {
        // Mobile menu
        const menuBtn = getEl('hamburger');
        const navMenu = getEl('navMenu');
        if (menuBtn && navMenu) {
            menuBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                menuBtn.classList.toggle('active');
                navMenu.classList.toggle('open');
            });

            navMenu.querySelectorAll('a, button').forEach(el => {
                el.addEventListener('click', () => {
                    menuBtn.classList.remove('active');
                    navMenu.classList.remove('open');
                });
            });

            document.addEventListener('click', (e) => {
                if (!e.target.closest('.navbar') && navMenu.classList.contains('open')) {
                    menuBtn.classList.remove('active');
                    navMenu.classList.remove('open');
                }
            });
        }

        // Language toggle
        const langBtn = getEl('langBtn');
        if (langBtn) {
            langBtn.textContent = state.lang === 'ne' ? 'English' : 'नेपाली';
            langBtn.addEventListener('click', () => {
                // Toggle language
                state.lang = state.lang === 'ne' ? 'en' : 'ne';
                
                // Update button text
                langBtn.textContent = state.lang === 'ne' ? 'English' : 'नेपाली';
                
                // Update all static UI labels
                updateLabels();
                
                // If we have weather data, re-fetch to get correct language
                if (state.focused) {
                    loadForecast(state.focused.lat, state.focused.lon, state.focused.name, true);
                }
                
                // Save language preference
                try {
                    localStorage.setItem('nepalsky_lang', state.lang);
                } catch(e) {}
            });
        }

        // Refresh button
        const refreshBtn = getEl('refreshBtn');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => {
                if (state.autoRefreshTimer) clearInterval(state.autoRefreshTimer);
                window.location.reload();
            });
        }

        // Search input
        const searchInput = getEl('searchInput');
        if (searchInput) {
            searchInput.placeholder = t('searchPh');
            
            searchInput.addEventListener('input', function() {
                clearTimeout(state.searchTimer);
                state.searchTimer = setTimeout(() => {
                    searchLocations(this.value.trim());
                }, 300);
            });

            searchInput.addEventListener('focus', function() {
                if (this.value.trim().length >= 2) {
                    searchLocations(this.value.trim());
                } else if (state.recentSearches.length) {
                    const panel = getEl('searchResults');
                    if (panel) {
                        panel.classList.add('active');
                        renderRecentChips();
                    }
                }
            });

            searchInput.addEventListener('keydown', function(e) {
                const panel = getEl('searchResults');
                if (!panel || !panel.classList.contains('active')) return;
                
                const items = panel.querySelectorAll('.search-result-item:not(.recent-chip)');
                
                if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    state.keyboardIndex = Math.min(state.keyboardIndex + 1, items.length - 1);
                    updateKeyboardSelection(items);
                } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    state.keyboardIndex = Math.max(state.keyboardIndex - 1, 0);
                    updateKeyboardSelection(items);
                } else if (e.key === 'Enter') {
                    e.preventDefault();
                    if (state.keyboardIndex >= 0 && items[state.keyboardIndex]) {
                        selectLocation(items[state.keyboardIndex]);
                    }
                } else if (e.key === 'Escape') {
                    hideSearchResults();
                }
            });
        }

        function updateKeyboardSelection(items) {
            items.forEach((item, i) => {
                if (i === state.keyboardIndex) {
                    item.classList.add('keyboard-active');
                    item.scrollIntoView({ block: 'nearest' });
                } else {
                    item.classList.remove('keyboard-active');
                }
            });
        }

        // Clear search button
        const searchClearBtn = getEl('searchClearBtn');
        if (searchClearBtn) {
            searchClearBtn.addEventListener('click', () => {
                const si = getEl('searchInput');
                if (si) {
                    si.value = '';
                    si.focus();
                }
                hideSearchResults();
            });
        }

        // Clear recent button
        const recentClearBtn = getEl('recentClearBtn');
        if (recentClearBtn) {
            recentClearBtn.addEventListener('click', clearRecent);
        }

        // Close search on outside click
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.search-container')) {
                hideSearchResults();
            }
        });

        // Clock
        function tick() {
            const n = new Date();
            setText('dashClock', n.toLocaleTimeString('en-US', {
                hour: '2-digit',
                minute: '2-digit',
                hour12: true,
                timeZone: 'Asia/Kathmandu'
            }));
            setText('dashDate', n.toLocaleDateString('en-US', {
                day: 'numeric',
                month: 'short',
                year: 'numeric'
            }));
        }
        tick();
        setInterval(tick, 30000);

        // Initial render
        updateLabels();
        renderRecentChips();
    }

    // Start the app
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();