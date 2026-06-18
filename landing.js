(function() {
    'use strict';

    // ============================================
    // DEBUG MODE
    // ============================================
    const DEBUG = false;
    function log(...args) { if (DEBUG) console.log('[NepalSky Landing]', ...args); }
    function warn(...args) { console.warn('[NepalSky Landing]', ...args); }
    function error(...args) { console.error('[NepalSky Landing]', ...args); }

    // ============================================
    // API CONFIGURATION
    // ============================================
    const API = {
        openMeteo: 'https://api.open-meteo.com/v1/forecast',
        country: 'https://dhm.gov.np/mfd/api/country-forecast',
        threeDayList: 'https://dhm.gov.np/mfd/api/three-days-forecast-latest',
        threeDayInfo: 'https://dhm.gov.np/mfd/api/three-days-forecast-info/'
    };

    // Refresh intervals
    const CITY_REFRESH_INTERVAL = 10 * 60 * 1000; // 10 minutes
    const ANALYSIS_REFRESH_INTERVAL = 30 * 60 * 1000; // 30 minutes

    // ============================================
    // POPULAR CITIES (Only Open-Meteo)
    // ============================================
    const POPULAR = [
        { name: 'Kathmandu', lat: 27.7172, lon: 85.3240 },
        { name: 'Pokhara', lat: 28.2096, lon: 83.9856 },
        { name: 'Biratnagar', lat: 26.4525, lon: 87.2718 },
        { name: 'Chitwan', lat: 27.5291, lon: 84.3542 },
        { name: 'Lumbini', lat: 27.4691, lon: 83.2760 },
        { name: 'Janakpur', lat: 26.7271, lon: 85.9406 },
        { name: 'Dhangadhi', lat: 28.6950, lon: 80.5930 },
        { name: 'Nepalgunj', lat: 28.0500, lon: 81.6167 },
        { name: 'Dharan', lat: 26.8167, lon: 87.2833 }
    ];

    // ============================================
    // STATE
    // ============================================
    let currentLang = 'en';
    let forecastLang = 'en';
    let provinceMap = new Map();
    let threeDayData = null;
    let cityRefreshTimer = null;
    let analysisRefreshTimer = null;
    window._countryData = null;

    // ============================================
    // DOM HELPERS
    // ============================================
    const getEl = (id) => {
        const el = document.getElementById(id);
        if (!el && DEBUG) warn(`Element #${id} not found`);
        return el;
    };
    
    const setText = (id, value) => { 
        const el = getEl(id); 
        if (el && value !== undefined && value !== null) {
            el.textContent = value; 
        }
    };

    // ============================================
    // API FETCH
    // ============================================
    async function fetchJSON(url) { 
        try { 
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 10000);
            
            const r = await fetch(url, { 
                signal: controller.signal,
                headers: { 'Accept': 'application/json' }
            });
            
            clearTimeout(timeout);
            
            if (!r.ok) throw new Error(`HTTP ${r.status}`); 
            return await r.json();
        } catch(e) { 
            error('Fetch failed:', e.message);
            return null; 
        } 
    }

    // ============================================
    // WMO WEATHER CODES
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
        const w = getWMODescription(code); 
        return lang === 'ne' ? w.ne : w.en; 
    }

    // ============================================
    // NEPALI DATE CONVERTER
    // ============================================
    function toNepaliDate(englishDate) {
        const date = new Date(englishDate);
        
        const nepaliMonths = [
            'बैशाख', 'जेष्ठ', 'आषाढ', 'श्रावण', 'भाद्र',
            'आश्विन', 'कार्तिक', 'मंसिर', 'पौष', 'माघ', 'फागुन', 'चैत्र'
        ];
        
        const nepaliDays = [
            'आइतबार', 'सोमबार', 'मंगलबार', 'बुधबार',
            'बिहीबार', 'शुक्रबार', 'शनिबार'
        ];
        
        const nepaliDigits = ['०', '१', '२', '३', '४', '५', '६', '७', '८', '९'];
        
        const toNpDigits = (num) => {
            return String(num).split('').map(d => {
                const n = parseInt(d);
                return isNaN(n) ? d : nepaliDigits[n];
            }).join('');
        };
        
        const nepaliYear = date.getFullYear() + 57;
        const dayName = nepaliDays[date.getDay()];
        
        const nepaliNewYear = new Date(date.getFullYear(), 3, 14); // April 14
        let nepaliDayOfYear;
        
        if (date >= nepaliNewYear) {
            nepaliDayOfYear = Math.floor((date - nepaliNewYear) / (1000 * 60 * 60 * 24));
        } else {
            const prevNepaliNewYear = new Date(date.getFullYear() - 1, 3, 14);
            nepaliDayOfYear = Math.floor((date - prevNepaliNewYear) / (1000 * 60 * 60 * 24));
        }
        
        const monthDays = [31, 31, 32, 31, 31, 30, 30, 30, 29, 30, 30, 30];
        let monthIndex = 0;
        let dayRemaining = nepaliDayOfYear;
        
        for (let i = 0; i < 12; i++) {
            if (dayRemaining < monthDays[i]) {
                monthIndex = i;
                break;
            }
            dayRemaining -= monthDays[i];
            monthIndex = i;
        }
        
        const nepaliMonth = nepaliMonths[monthIndex];
        const nepaliDay = dayRemaining + 1;
        
        const hours = date.getHours();
        const minutes = date.getMinutes();
        const hours12 = hours % 12 || 12;
        const ampm = hours >= 12 ? 'PM' : 'AM';
        const timeStr = `${toNpDigits(hours12)}:${toNpDigits(minutes.toString().padStart(2, '0'))} ${ampm}`;
        
        return `${dayName}, ${toNpDigits(nepaliDay)} ${nepaliMonth} ${toNpDigits(nepaliYear)} · ${timeStr}`;
    }

    function stripHTML(html) { 
        if(!html) return ''; 
        const t = document.createElement('div'); 
        t.innerHTML = html; 
        return (t.textContent || t.innerText || '').replace(/\s+/g,' ').trim(); 
    }

    // ============================================
    // FETCH CITY WEATHER (Only Open-Meteo)
    // ============================================
    async function fetchCityWeather(city) {
        const params = new URLSearchParams({
            latitude: city.lat,
            longitude: city.lon,
            current: 'temperature_2m,weather_code,relative_humidity_2m,wind_speed_10m',
            daily: 'precipitation_probability_max',
            timezone: 'Asia/Kathmandu',
            forecast_days: 1
        });
        
        const data = await fetchJSON(`${API.openMeteo}?${params}`);
        
        if (!data || !data.current) {
            return {
                name: city.name,
                temp: '--',
                weather_code: 0,
                weather_name: 'Unavailable',
                icon: '❓',
                humidity: '--',
                wind: '--',
                rain_probability: 0
            };
        }
        
        return {
            name: city.name,
            temp: Math.round(data.current.temperature_2m || 0),
            weather_code: data.current.weather_code || 0,
            weather_name: getWeatherName(data.current.weather_code || 0, 'en'),
            icon: getIcon(data.current.weather_code || 0),
            humidity: Math.round(data.current.relative_humidity_2m || 0),
            wind: (data.current.wind_speed_10m || 0).toFixed(1),
            rain_probability: data.daily?.precipitation_probability_max?.[0] || 0
        };
    }

    // ============================================
    // RENDER CITIES GRID
    // ============================================
    async function renderCitiesGrid() {
        const grid = getEl('citiesGrid');
        if (!grid) return;
        
        // Only show loading on first load
        if (!grid.hasAttribute('data-loaded')) {
            grid.innerHTML = '<div class="loading-state">⏳ Loading live weather data...</div>';
        }
        
        try {
            const updateTime = new Date();
            
            // Fetch all cities in parallel from Open-Meteo
            const cityPromises = POPULAR.map(city => fetchCityWeather(city));
            const citiesData = await Promise.all(cityPromises);
            const validCities = citiesData.filter(city => city && city.temp !== '--');
            
            if (validCities.length === 0) {
                grid.innerHTML = '<div class="error-state">⚠️ Unable to load weather data. Please check your connection.</div>';
                return;
            }
            
            grid.setAttribute('data-loaded', 'true');
            grid.setAttribute('data-updated', updateTime.toISOString());
            
            grid.innerHTML = validCities.map(city => {
                const cityInfo = POPULAR.find(c => c.name === city.name);
                return `
                <a href="dashboard.html" 
                   class="city-card" 
                   data-city="${city.name}"
                   data-lat="${cityInfo.lat}"
                   data-lon="${cityInfo.lon}">
                    <div class="city-card-icon">${city.icon}</div>
                    <div class="city-card-name">${city.name}</div>
                    <div class="city-card-temp">${city.temp}°C</div>
                    <div class="city-card-cond">${city.weather_name}</div>
                    <div class="city-card-meta">
                        <span>💧 ${city.humidity}%</span>
                        <span>💨 ${city.wind} m/s</span>
                    </div>
                    <div class="city-card-rain">🌧️ ${city.rain_probability}%</div>
                </a>
                `;
            }).join('');

            // Add click handlers
            grid.querySelectorAll('.city-card').forEach(card => {
                card.addEventListener('click', function(e) {
                    e.preventDefault();
                    const name = this.dataset.city;
                    const lat = parseFloat(this.dataset.lat);
                    const lon = parseFloat(this.dataset.lon);
                    
                    try {
                        localStorage.setItem('nepalsky_direct_city', JSON.stringify({ name, lat, lon }));
                        localStorage.setItem('nepalsky_last_location', JSON.stringify({ name, lat, lon }));
                    } catch(err) {}
                    
                    window.location.href = 'dashboard.html';
                });
            });
            
            // Update live indicator
            updateLiveIndicator(updateTime);
            
        } catch(e) {
            error('Error rendering cities grid:', e);
            if (!grid.hasAttribute('data-loaded')) {
                grid.innerHTML = '<div class="error-state">❌ Error loading cities. Please try again later.</div>';
            }
        }
    }

    function updateLiveIndicator(updateTime) {
        let indicator = getEl('citiesUpdateTime');
        if (!indicator) {
            const sectionHeader = document.querySelector('.cities-section .section-sub');
            if (sectionHeader) {
                indicator = document.createElement('div');
                indicator.id = 'citiesUpdateTime';
                indicator.className = 'live-indicator';
                sectionHeader.parentNode.insertBefore(indicator, sectionHeader.nextSibling);
            }
        }
        if (indicator) {
            const timeStr = updateTime.toLocaleTimeString('en-US', { 
                hour: '2-digit', 
                minute: '2-digit',
                hour12: true 
            });
            indicator.innerHTML = `<span class="live-dot"></span> Live · Updated ${timeStr}`;
            indicator.style.cssText = 'font-size: 12px; color: #22c55e; margin-top: 8px; display: flex; align-items: center; gap: 6px; justify-content: center;';
        }
    }

    // ============================================
    // ANALYSIS DATA
    // ============================================
    function updateAnalysisData(countryData) {
        if (!countryData) {
            countryData = {
                analysis_en: "Weather analysis temporarily unavailable.",
                analysis_np: "मौसम विश्लेषण अस्थायी रूपमा अनुपलब्ध।",
                en_text_1: "Data currently unavailable",
                np_text_1: "डाटा हाल अनुपलब्ध",
                en_text_2: "Please check back later",
                np_text_2: "कृपया पछि जाँच गर्नुहोस्",
                issue_date: new Date().toISOString(),
                user: { name: "DHM Nepal" }
            };
        }
        
        window._countryData = countryData;
        const issueDate = countryData.issue_date ? new Date(countryData.issue_date) : new Date();
        const isEvening = issueDate.getHours() >= 18 || issueDate.getHours() < 6;
        
        setText('storyTextEn', (countryData.analysis_en || 'Analysis unavailable').trim());
        setText('storyTextNp', (countryData.analysis_np || 'विश्लेषण अनुपलब्ध').trim());
        
        if (countryData.en_text_1) {
            setText('storyTodayEn', (isEvening ? '🌙 Tonight' : '☀️ Today') + ': ' + countryData.en_text_1.trim());
        }
        if (countryData.np_text_1) {
            setText('storyTodayNp', (isEvening ? '🌙 राती' : '☀️ आज') + ': ' + countryData.np_text_1.trim());
        }
        if (countryData.en_text_2) {
            setText('storyTonightEn', (isEvening ? '📅 Tomorrow' : '🌙 Tonight') + ': ' + countryData.en_text_2.trim());
        }
        if (countryData.np_text_2) {
            setText('storyTonightNp', (isEvening ? '📅 भोलि' : '🌙 राती') + ': ' + countryData.np_text_2.trim());
        }
        
        updateAnalysisAttribution(countryData);
    }

    function updateAnalysisAttribution(countryData) {
        if (!countryData) return;
        const issueDate = countryData.issue_date ? new Date(countryData.issue_date) : new Date();
        const userName = countryData.user?.name || 'DHM Nepal';
        
        if (currentLang === 'np') {
            setText('storyAttr', 'विश्लेषण: ' + userName + ' · जारी मिति: ' + toNepaliDate(issueDate));
        } else {
            const d = issueDate.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
            const t = issueDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
            setText('storyAttr', 'Analysis: ' + userName + ' · Issued: ' + d + ' at ' + t);
        }
    }

    function switchStoryLang(lang) {
        currentLang = lang;
        document.querySelectorAll('.story-panel').forEach(p => p.classList.remove('active'));
        document.querySelectorAll('.story-lang-btn').forEach(b => b.classList.remove('active'));
        
        const panel = getEl('panelStory' + (lang === 'en' ? 'En' : 'Np'));
        const btn = getEl('btnStory' + (lang === 'en' ? 'En' : 'Np'));
        if (panel) panel.classList.add('active');
        if (btn) btn.classList.add('active');
        
        updateAllHeadings();
        
        if (window._countryData) {
            updateAnalysisAttribution(window._countryData);
        }
    }

    function updateAllHeadings() {
        const aHeading = getEl('analysisHeading');
        const aSub = getEl('analysisSubheading');
        if (currentLang === 'np') {
            if (aHeading) aHeading.textContent = 'नेपाल मौसम अवलोकन';
            if (aSub) aSub.textContent = 'जल तथा मौसम विज्ञान विभाग, नेपालको आधिकारिक विश्लेषण';
        } else {
            if (aHeading) aHeading.textContent = 'Nepal Weather Overview';
            if (aSub) aSub.textContent = 'Official analysis from Department of Hydrology and Meteorology, Nepal';
        }
        const fHeading = document.querySelector('#forecastInfo .section-heading');
        if (fHeading) fHeading.textContent = forecastLang === 'np' ? '३ दिनको प्रादेशिक पूर्वानुमान' : '3-Day Province Forecast';
    }

    // ============================================
    // PROVINCE FORECAST
    // ============================================
    function formatProvinceForecast(dayData, lang) {
        if (!dayData || (!dayData.day && !dayData.night)) {
            return lang === 'np' ? 'कुनै पूर्वानुमान छैन' : 'No forecast data available';
        }
        
        let text = '';
        if (dayData.day) {
            text += '<strong>☀️ ' + (lang === 'np' ? 'दिन' : 'Day') + ':</strong><br>';
            text += (lang === 'np' ? dayData.day.np : dayData.day.en);
        }
        if (dayData.night) {
            if (text) text += '<br><br>';
            text += '<strong>🌙 ' + (lang === 'np' ? 'राती' : 'Night') + ':</strong><br>';
            text += (lang === 'np' ? dayData.night.np : dayData.night.en);
        }
        return text;
    }

    function renderProvinceCards(data) {
        if (!data?.data?.length) {
            const grid = getEl('provinceCardsGrid');
            if (grid) grid.innerHTML = '<div class="no-data">📭 Province forecast data currently unavailable</div>';
            return;
        }
        
        setText('forecastTitle', data.title || '3-Day Province Forecast');
        provinceMap = new Map();
        
        try {
            data.data.forEach(day => {
                if (day.forecast) {
                    day.forecast.forEach(f => {
                        const key = f.division?.name || f.division?.nepali_name || '';
                        if (!key) return;
                        if (!provinceMap.has(key)) {
                            provinceMap.set(key, {
                                name: f.division?.name || key,
                                nepaliName: f.division?.nepali_name || key,
                                forecasts: {}
                            });
                        }
                        const prov = provinceMap.get(key);
                        const dayNum = parseInt(day.day);
                        const status = f.day_status === '1' ? 'day' : 'night';
                        if (!prov.forecasts[dayNum]) prov.forecasts[dayNum] = {};
                        prov.forecasts[dayNum][status] = {
                            en: stripHTML(f.text?.en || ''),
                            np: stripHTML(f.text?.np || '')
                        };
                    });
                }
            });
            
            const grid = getEl('provinceCardsGrid');
            if (!grid) return;
            
            const provinces = Array.from(provinceMap.values());
            if (provinces.length === 0) {
                grid.innerHTML = '<div class="no-data">📭 No province data available</div>';
                return;
            }
            
            const dayBtns = forecastLang === 'np' ? ['दिन १', 'दिन २', 'दिन ३'] : ['Day 1', 'Day 2', 'Day 3'];
            
            grid.innerHTML = provinces.map((prov, idx) => {
                const displayName = forecastLang === 'np' ? (prov.nepaliName || prov.name) : prov.name;
                const day1 = prov.forecasts[1] || {};
                return `<div class="province-card collapsed" id="provCard${idx}">
                    <div class="province-card-header" onclick="window.NepalSky.toggleProvinceCard(${idx})">
                        <span class="province-card-name">${displayName}</span>
                        <span class="province-card-arrow">▾</span>
                    </div>
                    <div class="province-card-body" id="provBody${idx}" style="display:none">
                        <div class="day-toggle">
                            <button class="day-toggle-btn active" onclick="event.stopPropagation();window.NepalSky.switchProvinceDay(${idx},1,this)">${dayBtns[0]}</button>
                            <button class="day-toggle-btn" onclick="event.stopPropagation();window.NepalSky.switchProvinceDay(${idx},2,this)">${dayBtns[1]}</button>
                            <button class="day-toggle-btn" onclick="event.stopPropagation();window.NepalSky.switchProvinceDay(${idx},3,this)">${dayBtns[2]}</button>
                        </div>
                        <div class="forecast-text" id="fcContent${idx}">${formatProvinceForecast(day1, forecastLang)}</div>
                    </div>
                </div>`;
            }).join('');
            
            const ft = data.footer;
            if (ft) setText('forecastFooter', stripHTML(ft.en || ft.np || ''));
            updateAllHeadings();
        } catch (e) {
            error('Error rendering province cards:', e);
        }
    }

    // Expose functions globally
    window.NepalSky = {
        toggleProvinceCard: function(idx) {
            const body = getEl('provBody' + idx);
            const card = getEl('provCard' + idx);
            if (!card || !body) return;
            
            if (card.classList.contains('open')) {
                card.classList.remove('open');
                card.classList.add('collapsed');
                body.style.display = 'none';
                const a = card.querySelector('.province-card-arrow');
                if (a) a.textContent = '▾';
                return;
            }
            
            document.querySelectorAll('.province-card').forEach(c => {
                c.classList.remove('open');
                c.classList.add('collapsed');
                const b = c.querySelector('.province-card-body');
                if (b) b.style.display = 'none';
                const a = c.querySelector('.province-card-arrow');
                if (a) a.textContent = '▾';
            });
            
            card.classList.remove('collapsed');
            card.classList.add('open');
            body.style.display = 'block';
            const arrow = card.querySelector('.province-card-arrow');
            if (arrow) arrow.textContent = '▴';
            
            setTimeout(() => {
                const r = card.getBoundingClientRect();
                window.scrollTo({ top: window.pageYOffset + r.top - 80, behavior: 'smooth' });
            }, 150);
        },

        switchProvinceDay: function(cardIdx, dayNum, btn) {
            const card = getEl('provCard' + cardIdx);
            if (!card) return;
            
            card.querySelectorAll('.day-toggle-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            const prov = Array.from(provinceMap.values())[cardIdx];
            if (!prov) return;
            
            const content = getEl('fcContent' + cardIdx);
            if (content) {
                content.innerHTML = formatProvinceForecast(prov.forecasts[dayNum] || {}, forecastLang);
            }
        }
    };

    // ============================================
    // AUTO-REFRESH
    // ============================================
    function startAutoRefresh() {
        if (cityRefreshTimer) clearInterval(cityRefreshTimer);
        if (analysisRefreshTimer) clearInterval(analysisRefreshTimer);
        
        // Cities: every 10 minutes
        cityRefreshTimer = setInterval(() => {
            log('Auto-refreshing cities...');
            renderCitiesGrid();
        }, CITY_REFRESH_INTERVAL);
        
        // Analysis & forecast: every 30 minutes
        analysisRefreshTimer = setInterval(async () => {
            log('Auto-refreshing analysis...');
            const countryData = await fetchJSON(API.country);
            updateAnalysisData(countryData);
            
            const threeDayList = await fetchJSON(API.threeDayList);
            if (threeDayList?.length) {
                const latest = threeDayList.sort((a, b) => new Date(b.issue_date) - new Date(a.issue_date))[0];
                threeDayData = await fetchJSON(API.threeDayInfo + latest.id);
                if (threeDayData) renderProvinceCards(threeDayData);
            }
        }, ANALYSIS_REFRESH_INTERVAL);
    }

    // ============================================
    // INITIALIZATION
    // ============================================
    async function init() {
        log('Initializing NepalSky Landing Page...');
        
        // Navbar scroll effect
        const navbar = document.getElementById('navbar');
        if (navbar) {
            window.addEventListener('scroll', () => {
                if (window.scrollY > 50) navbar.classList.add('scrolled');
                else navbar.classList.remove('scrolled');
            });
        }
        
        // Smooth scroll
        document.querySelectorAll('a[href^="#"]').forEach(anchor => {
            anchor.addEventListener('click', function(e) {
                const href = this.getAttribute('href');
                if (href === '#') return;
                const target = document.querySelector(href);
                if (target) {
                    e.preventDefault();
                    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
            });
        });
        
        // Counter animation
        document.querySelectorAll('.hm-num[data-count]').forEach(counter => {
            const target = parseInt(counter.dataset.count);
            let current = 0;
            const timer = setInterval(() => {
                current += target / 50;
                if (current >= target) {
                    counter.textContent = target;
                    clearInterval(timer);
                } else {
                    counter.textContent = Math.floor(current);
                }
            }, 30);
        });
        
        // Mobile menu
        const menuBtn = getEl('hamburger');
        const navMenu = getEl('navMenu');
        if (menuBtn && navMenu) {
            menuBtn.addEventListener('click', e => {
                e.stopPropagation();
                menuBtn.classList.toggle('active');
                navMenu.classList.toggle('open');
            });
            
            navMenu.querySelectorAll('[data-nav]').forEach(l => {
                l.addEventListener('click', () => {
                    menuBtn.classList.remove('active');
                    navMenu.classList.remove('open');
                });
            });
            
            document.addEventListener('click', e => {
                if (!e.target.closest('.navbar') && navMenu.classList.contains('open')) {
                    menuBtn.classList.remove('active');
                    navMenu.classList.remove('open');
                }
            });
        }

        // Language buttons
        getEl('btnStoryEn')?.addEventListener('click', () => switchStoryLang('en'));
        getEl('btnStoryNp')?.addEventListener('click', () => switchStoryLang('np'));
        getEl('btnFcEn')?.addEventListener('click', function() {
            forecastLang = 'en';
            this.classList.add('active');
            getEl('btnFcNp')?.classList.remove('active');
            if (threeDayData) renderProvinceCards(threeDayData);
        });
        getEl('btnFcNp')?.addEventListener('click', function() {
            forecastLang = 'np';
            this.classList.add('active');
            getEl('btnFcEn')?.classList.remove('active');
            if (threeDayData) renderProvinceCards(threeDayData);
        });

        // Modal
        const modal = getEl('forecastModal');
        const modalClose = getEl('forecastModalClose');
        if (modal && modalClose) {
            modalClose.addEventListener('click', () => modal.classList.remove('active'));
            modal.addEventListener('click', e => {
                if (e.target === modal) modal.classList.remove('active');
            });
        }
        document.addEventListener('keydown', e => {
            if (e.key === 'Escape' && modal) modal.classList.remove('active');
        });

        // Fetch initial data
        await renderCitiesGrid();
        
        const countryData = await fetchJSON(API.country);
        updateAnalysisData(countryData);
        
        const threeDayList = await fetchJSON(API.threeDayList);
        if (threeDayList?.length) {
            const latest = threeDayList.sort((a, b) => new Date(b.issue_date) - new Date(a.issue_date))[0];
            threeDayData = await fetchJSON(API.threeDayInfo + latest.id);
            if (threeDayData) renderProvinceCards(threeDayData);
        }
        
        startAutoRefresh();
        updateAllHeadings();
        
        log('Initialization complete');
    }

    // Start
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();