  const SHOW_MAP = false;

  const ASSET_VERSION = "1";
  const PLANNED_BOOTHS_KEY = "eventInfoViewer.plannedBooths";

  let allBooths = [];
  let overlayInitialized = false;
  let activeBoothId = null;
  let activeTab = "all";
  let searchQuery = "";
  let boothRects = {};
  let boothListItems = {};
  let boothOverlayElements = {};
  let plannedBoothIds = loadPlannedBooths();

  const viewer = SHOW_MAP ? OpenSeadragon({
    id: "viewer",
    prefixUrl: "images/",
    tileSources: "map/tgs2026.dzi?v=" + ASSET_VERSION,
    gestureSettingsMouse: {
      clickToZoom: false,
      dblClickToZoom: true,
      dragToPan: true,
      scrollToZoom: true
    }
  }) : null;

  if (!SHOW_MAP) document.body.classList.add("map-hidden");

  if (viewer) {
    viewer.addHandler("open-failed", (event) => {
      console.error("地図画像の読み込みに失敗しました:", event);
      document.getElementById("viewer").textContent = "地図の読み込みに失敗しました。時間をおいて再度お試しください。";
    });
  }

  let sidebarExpanded = false;

  function setSidebarExpanded(expanded) {
      sidebarExpanded = expanded;
      document.getElementById("app-body").classList.toggle("sidebar-expanded", expanded);
      const btn = document.getElementById("sidebar-toggle");
      btn.textContent = expanded ? "▼ 地図を表示" : "▲ 全画面表示";
      btn.setAttribute("aria-expanded", String(expanded));
      if (!expanded) {
          window.dispatchEvent(new Event("resize"));
      }
  }

  document.getElementById("sidebar-toggle").addEventListener("click", () => {
      setSidebarExpanded(!sidebarExpanded);
  });

  function escapeHtml(str) {
      return String(str).replace(/[&<>"']/g, ch => ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;"
      }[ch]));
  }

  function isSafeUrl(url) {
      try {
          const u = new URL(url, window.location.href);
          return u.protocol === "http:" || u.protocol === "https:";
      } catch {
          return false;
      }
  }

  function toUrlArray(value) {
      if (!value) return [];
      if (Array.isArray(value)) return value;
      if (typeof value === "string") return [value];
      return [];
  }

  function renderDetailLink(url, label) {
      if (!url || !isSafeUrl(url)) {
          return `<span class="detail-link detail-link--disabled">${escapeHtml(label)}</span>`;
      }
      return `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer" class="detail-link">${escapeHtml(label)}</a>`;
  }

  function extractSnsHandle(url) {
      try {
          const path = new URL(url).pathname.replace(/^\/|\/$/g, "");
          return path ? `@${path}` : url;
      } catch {
          return url;
      }
  }

  function normalizePerformer(p) {
      if (typeof p === "string") return { name: "", url: p };
      return p || {};
  }

  function renderPerformerItem(p) {
      const hasUrl = p.url && isSafeUrl(p.url);

      if (p.name && hasUrl) {
          return `<li>${renderDetailLink(p.url, `${p.name}（${extractSnsHandle(p.url)}）`)}</li>`;
      }
      if (p.name) {
          return `<li><span class="detail-link detail-link--disabled">${escapeHtml(p.name)}</span></li>`;
      }
      if (hasUrl) {
          return `<li>${renderDetailLink(p.url, p.url)}</li>`;
      }
      return "";
  }

  function loadPlannedBooths() {
      try {
          const raw = localStorage.getItem(PLANNED_BOOTHS_KEY);
          return new Set(raw ? JSON.parse(raw) : []);
      } catch {
          return new Set();
      }
  }

  function savePlannedBooths() {
      try {
          localStorage.setItem(PLANNED_BOOTHS_KEY, JSON.stringify([...plannedBoothIds]));
      } catch {
          // localStorageが使えない環境では保存をあきらめる
      }
  }

  function togglePlanned(boothId, isPlanned) {
      if (isPlanned) {
          plannedBoothIds.add(boothId);
      } else {
          plannedBoothIds.delete(boothId);
      }
      savePlannedBooths();

      const overlay = boothOverlayElements[boothId];
      if (overlay) overlay.classList.toggle("booth-overlay--planned", isPlanned);

      const listItem = boothListItems[boothId];
      if (listItem) {
          const listCheck = listItem.querySelector(".booth-check");
          if (listCheck) listCheck.checked = isPlanned;
      }

      const detail = document.getElementById("booth-detail");
      if (detail.dataset.boothId === boothId) {
          const detailCheck = detail.querySelector(".detail-check");
          if (detailCheck) detailCheck.checked = isPlanned;
      }

      if (activeTab === "checked") renderBoothList();
  }

  function getVisibleBooths() {
      if (activeTab === "checked") {
          return allBooths.filter(b => plannedBoothIds.has(b.id));
      }
      if (activeTab === "search") {
          const q = searchQuery.trim().toLowerCase();
          if (!q) return [];
          return allBooths.filter(b =>
              (b.boothNo && b.boothNo.toLowerCase().startsWith(q)) ||
              (b.name && b.name.toLowerCase().startsWith(q))
          );
      }
      return allBooths;
  }

  function setActiveTab(tab) {
      activeTab = tab;
      document.getElementById("tab-all").classList.toggle("tab-button--active", tab === "all");
      document.getElementById("tab-all").setAttribute("aria-selected", String(tab === "all"));
      document.getElementById("tab-checked").classList.toggle("tab-button--active", tab === "checked");
      document.getElementById("tab-checked").setAttribute("aria-selected", String(tab === "checked"));
      document.getElementById("tab-search").classList.toggle("tab-button--active", tab === "search");
      document.getElementById("tab-search").setAttribute("aria-selected", String(tab === "search"));
      document.getElementById("search-box").hidden = tab !== "search";
      closeBoothDetail();
      renderBoothList();
      if (tab === "search") document.getElementById("search-input").focus();
  }

  document.getElementById("tab-all").addEventListener("click", () => setActiveTab("all"));
  document.getElementById("tab-checked").addEventListener("click", () => setActiveTab("checked"));
  document.getElementById("tab-search").addEventListener("click", () => setActiveTab("search"));
  document.getElementById("search-input").addEventListener("input", (e) => {
      searchQuery = e.target.value;
      closeBoothDetail();
      renderBoothList();
  });

  function setActiveBooth(boothId) {
      if (activeBoothId != null) {
          const prevItem = boothListItems[activeBoothId];
          if (prevItem) prevItem.classList.remove("booth-item--active");
          const prevOverlay = boothOverlayElements[activeBoothId];
          if (prevOverlay) prevOverlay.classList.remove("booth-overlay--active");
      }
      activeBoothId = boothId;
      const item = boothListItems[boothId];
      if (item) item.classList.add("booth-item--active");
      const overlay = boothOverlayElements[boothId];
      if (overlay) overlay.classList.add("booth-overlay--active");
  }

  const MIN_FOCUS_CONTEXT = 0.20;
  const MAX_FOCUS_CONTEXT = 0.30;

  function focusBoothOnMap(boothId) {
      const rect = boothRects[boothId];
      if (!rect) return; // 地図側の初期化が終わっていない場合は何もしない

      const boothSize = Math.max(rect.width, rect.height);
      const contextSize = Math.min(MAX_FOCUS_CONTEXT, Math.max(MIN_FOCUS_CONTEXT, boothSize * 3));
      const boxSize = Math.max(contextSize, rect.width, rect.height); // ブース全体は必ず収める

      const centerX = rect.x + rect.width / 2;
      const centerY = rect.y + rect.height / 2;

      const padded = new OpenSeadragon.Rect(
          centerX - boxSize / 2,
          centerY - boxSize / 2,
          boxSize,
          boxSize
      );
      viewer.viewport.fitBounds(padded, false);
  }

  function selectBoothFromOverlay(booth) {
      setActiveBooth(booth.id);
      showBoothDetail(booth);
      const item = boothListItems[booth.id];
      if (item) item.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function createOverlayButton(boothId) {
      const div = document.createElement("div");
      div.className = "booth-overlay";
      if (plannedBoothIds.has(boothId)) div.classList.add("booth-overlay--planned");
      div.dataset.boothId = boothId;
      div.tabIndex = 0;
      div.setAttribute("role", "button");

      const booth = allBooths.find(b => b.id === boothId);
      div.setAttribute("aria-label", booth ? `${booth.name} を選択` : "ブースを選択");

      const label = document.createElement("span");
      label.className = "booth-overlay-label";
      label.textContent = booth ? booth.boothNo : "";
      div.appendChild(label);

      const activate = () => {
          const b = allBooths.find(b => b.id === boothId);
          if (b) selectBoothFromOverlay(b);
      };
      div.addEventListener("pointerdown", activate);
      div.addEventListener("keydown", (e) => {
          if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              activate();
          }
      });

      boothOverlayElements[boothId] = div;
      return div;
  }

  function renderBoothList() {
    const list = document.getElementById("booth-list");
    list.innerHTML = "";
    boothListItems = {};

    const booths = getVisibleBooths();

    if (booths.length === 0) {
      const empty = document.createElement("p");
      empty.className = "booth-list-empty";
      if (activeTab === "checked") {
        empty.textContent = "チェックされたブースはありません。";
      } else if (activeTab === "search") {
        empty.textContent = searchQuery.trim()
          ? "該当するブースが見つかりません。"
          : "ブース番号または名前を入力してください。";
      } else {
        empty.textContent = "ブース情報がありません。";
      }
      list.appendChild(empty);
      return;
    }

    for (const booth of booths) {
      const item = document.createElement("div");
      item.className = "booth-item";

      const checkboxId = `plan-check-${booth.id}`;
      item.innerHTML = `
        <input type="checkbox" class="booth-check" id="${checkboxId}" aria-label="${escapeHtml(booth.name)} に行く" ${plannedBoothIds.has(booth.id) ? "checked" : ""}>
        <div class="booth-info" role="button" tabindex="0" aria-label="${escapeHtml(booth.name)} を地図で表示">
          <span class="booth-id">${escapeHtml(booth.boothNo)}</span>
          <span class="booth-name">${escapeHtml(booth.name)}</span>
        </div>
        <button type="button" class="booth-detail-btn">詳細</button>
      `;

      const checkbox = item.querySelector(".booth-check");
      checkbox.addEventListener("click", (e) => e.stopPropagation());
      checkbox.addEventListener("change", () => togglePlanned(booth.id, checkbox.checked));

      const info = item.querySelector(".booth-info");
      const focusOnMap = () => {
        setActiveBooth(booth.id);
        focusBoothOnMap(booth.id);
      };
      info.addEventListener("click", focusOnMap);
      info.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          focusOnMap();
        }
      });

      item.querySelector(".booth-detail-btn").addEventListener("click", () => showBoothDetail(booth));

      boothListItems[booth.id] = item;
      list.appendChild(item);
    }
  }

  function showBoothDetail(booth) {
    const detail = document.getElementById("booth-detail");

    const officialLinks = [
      renderDetailLink(booth.urlPage, "公式ページ"),
      renderDetailLink(booth.urlSns, "公式SNS")
    ].join("");

    const performerLinks = (booth.performerSns || [])
      .map(normalizePerformer)
      .map(renderPerformerItem)
      .filter(Boolean)
      .join("");

    const postUrls = toUrlArray(booth.informationUrl).filter(url => url && isSafeUrl(url));
    const performerPostUrls = toUrlArray(booth.performerPost).filter(url => url && isSafeUrl(url));

    // 表示するセクションを決定。先頭に来たものが初期表示のタブになる。
    const sections = [];
    if (postUrls.length) sections.push({ key: "posts", label: "関連ポスト" });
    if (performerLinks || performerPostUrls.length) sections.push({ key: "performers", label: "コンパニオン（敬称略）" });

    function renderPostsPagerHtml() {
      return `
        <div class="detail-posts-nav">
          <button type="button" class="detail-posts-prev" aria-label="前のポスト">← 前へ</button>
          <span class="detail-posts-page"></span>
          <button type="button" class="detail-posts-next" aria-label="次のポスト">次へ →</button>
        </div>
        <div class="detail-posts-embed"></div>
      `;
    }
    const postsPanelHtml = renderPostsPagerHtml();
    const performersPanelHtml = `
      ${performerLinks ? `<ul>${performerLinks}</ul>` : ""}
      ${performerPostUrls.length > 0 && performerLinks.length > 0 ? '<hr class="detai-hr">' : ""}
      ${performerPostUrls.length ? renderPostsPagerHtml() : ""}
    `;
    const panelHtml = { posts: postsPanelHtml, performers: performersPanelHtml };

    detail.dataset.boothId = booth.id;

    detail.innerHTML = `
      <div class="detail-header">
        <input type="checkbox" class="detail-check" id="detail-check-${booth.id}" aria-label="${escapeHtml(booth.name)} に行く" ${plannedBoothIds.has(booth.id) ? "checked" : ""}>
        <h3 class="detail-title">${escapeHtml(booth.name)}</h3>
        <button type="button" class="detail-close booth-detail-btn">一覧に戻る</button>
      </div>
      ${booth.desc ? `<p>${escapeHtml(booth.desc)}</p>` : ""}
      <div class="detail-links">
        ${officialLinks}
        <div class="detail-nav">
          <button type="button" class="booth-detail-btn detail-prev-booth" aria-label="前のブースの詳細を表示">←</button>
          <button type="button" class="booth-detail-btn detail-next-booth" aria-label="次のブースの詳細を表示">→</button>
        </div>
      </div>
      ${sections.length ? `
        <div class="detail-sections">
          ${sections.length > 1 ? `
            <div class="detail-tabs" role="tablist">
              ${sections.map((s, i) => `
                <button type="button" class="detail-tab-button${i === 0 ? " detail-tab-button--active" : ""}" data-detail-tab="${s.key}" role="tab" aria-selected="${i === 0}">${escapeHtml(s.label)}</button>
              `).join("")}
            </div>
          ` : `<h4>${escapeHtml(sections[0].label)}</h4>`}
          ${sections.map((s, i) => `
            <div class="detail-tab-panel" data-detail-panel="${s.key}" ${i === 0 ? "" : "hidden"}>${panelHtml[s.key]}</div>
          `).join("")}
        </div>
      ` : ""}
    `;

    initDetailTabs(detail, sections, { posts: postUrls, performers: performerPostUrls });

    detail.querySelector(".detail-check").addEventListener("change", (e) => {
        togglePlanned(booth.id, e.target.checked);
    });
    detail.querySelector(".detail-close").addEventListener("click", closeBoothDetail);

    const visibleBooths = getVisibleBooths();
    const currentIndex = visibleBooths.findIndex(b => b.id === booth.id);
    const prevBooth = currentIndex > 0 ? visibleBooths[currentIndex - 1] : null;
    const nextBooth = currentIndex !== -1 && currentIndex < visibleBooths.length - 1 ? visibleBooths[currentIndex + 1] : null;

    const prevBtn = detail.querySelector(".detail-prev-booth");
    const nextBtn = detail.querySelector(".detail-next-booth");
    prevBtn.disabled = !prevBooth;
    prevBtn.classList.toggle("detail-link--disabled", !prevBooth);
    nextBtn.disabled = !nextBooth;
    nextBtn.classList.toggle("detail-link--disabled", !nextBooth);
    if (prevBooth) prevBtn.addEventListener("click", () => showBoothDetail(prevBooth));
    if (nextBooth) nextBtn.addEventListener("click", () => showBoothDetail(nextBooth));

    detail.classList.add("is-open");
    detail.querySelector(".detail-close").focus();
  }

  function initDetailTabs(detail, sections, pagerUrlsByKey) {
      if (!sections.length) return;

      const buttons = detail.querySelectorAll(".detail-tab-button");
      const initializedKeys = new Set();

      function activate(key) {
          buttons.forEach((btn) => {
              const active = btn.dataset.detailTab === key;
              btn.classList.toggle("detail-tab-button--active", active);
              btn.setAttribute("aria-selected", String(active));
          });
          detail.querySelectorAll(".detail-tab-panel").forEach((panel) => {
              panel.hidden = panel.dataset.detailPanel !== key;
          });
          const urls = pagerUrlsByKey[key];
          if (urls && urls.length && !initializedKeys.has(key)) {
              initializedKeys.add(key);
              const panel = detail.querySelector(`.detail-tab-panel[data-detail-panel="${key}"]`);
              if (panel) setupPostPager(panel, urls);
          }
      }

      buttons.forEach((btn) => {
          btn.addEventListener("click", () => activate(btn.dataset.detailTab));
      });

      activate(sections[0].key);
  }

  function renderTwitterEmbeds(container) {
      if (window.twttr && window.twttr.ready) {
          window.twttr.ready((t) => t.widgets.load(container));
      }
  }

  function setupPostPager(detail, postUrls) {
      let index = 0;
      const embed = detail.querySelector(".detail-posts-embed");
      const pageLabel = detail.querySelector(".detail-posts-page");
      const nav = detail.querySelector(".detail-posts-nav");
      const prevBtn = detail.querySelector(".detail-posts-prev");
      const nextBtn = detail.querySelector(".detail-posts-next");

      nav.style.display = postUrls.length > 1 ? "flex" : "none";

      function renderCurrent() {
          embed.innerHTML = `<blockquote class="twitter-tweet" data-dnt="true"><a href="${escapeHtml(postUrls[index])}"></a></blockquote>`;
          pageLabel.textContent = `${index + 1} / ${postUrls.length}`;
          prevBtn.disabled = index === 0;
          nextBtn.disabled = index === postUrls.length - 1;
          renderTwitterEmbeds(embed);
      }

      prevBtn.addEventListener("click", () => {
          if (index > 0) { index--; renderCurrent(); }
      });
      nextBtn.addEventListener("click", () => {
          if (index < postUrls.length - 1) { index++; renderCurrent(); }
      });

      renderCurrent();
  }

  function closeBoothDetail() {
    const detail = document.getElementById("booth-detail");
    detail.classList.remove("is-open");
    detail.innerHTML = "";
    delete detail.dataset.boothId;
  }

  document.getElementById("booth-detail").addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeBoothDetail();
  });

  const helpOverlay = document.getElementById("help-overlay");
  const helpButton = document.getElementById("help-button");

  function openHelp() {
      helpOverlay.hidden = false;
      document.getElementById("help-close").focus();
  }

  function closeHelp() {
      helpOverlay.hidden = true;
      helpButton.focus();
  }

  helpButton.addEventListener("click", openHelp);
  document.getElementById("help-close").addEventListener("click", closeHelp);
  helpOverlay.addEventListener("click", (e) => {
      if (e.target === helpOverlay) closeHelp();
  });

  const changelogOverlay = document.getElementById("changelog-overlay");
  const changelogButton = document.getElementById("changelog-button");

  function openChangelog() {
      changelogOverlay.hidden = false;
      document.getElementById("changelog-close").focus();
  }

  function closeChangelog() {
      changelogOverlay.hidden = true;
      changelogButton.focus();
  }

  changelogButton.addEventListener("click", openChangelog);
  document.getElementById("changelog-close").addEventListener("click", closeChangelog);
  changelogOverlay.addEventListener("click", (e) => {
      if (e.target === changelogOverlay) closeChangelog();
  });

  document.addEventListener("keydown", (e) => {
      if (e.key !== "Escape") return;
      if (!helpOverlay.hidden) closeHelp();
      if (!changelogOverlay.hidden) closeChangelog();
  });

  fetch("json/booths.json?v=" + ASSET_VERSION)
    .then(r => {
      if (!r.ok) throw new Error(`booths.json の取得に失敗しました (status: ${r.status})`);
      return r.json();
    })
    .then(booths => {
      allBooths = booths;
      renderBoothList();
      if (viewer) {
        viewer.addHandler("tile-loaded", () => {
          if (overlayInitialized) return;
          overlayInitialized = true;

          const img = viewer.world.getItemAt(0);
          const imageWidth = img.getContentSize().x;

          for (const booth of booths) {
            if (![booth.x, booth.y, booth.w, booth.h].every(Number.isFinite)) {
              console.warn("座標が不正なため booth をスキップしました:", booth.id);
              continue;
            }

            const rect = new OpenSeadragon.Rect(
              booth.x / imageWidth,
              booth.y / imageWidth,
              booth.w / imageWidth,
              booth.h / imageWidth
            );
            boothRects[booth.id] = rect;

            viewer.addOverlay({
              element: createOverlayButton(booth.id),
              location: rect
            });
          }
        });
      }
    })
    .catch(err => {
      console.error(err);
      document.getElementById("booth-list").textContent =
        "ブース情報の読み込みに失敗しました。時間をおいて再度お試しください。";
    });

  if (viewer) {
    viewer.addHandler("canvas-click", function(event) {
      const webPoint = event.position;
      const viewportPoint = viewer.viewport.pointFromPixel(webPoint);
      const imagePoint = viewer.viewport.viewportToImageCoordinates(viewportPoint);

      const x_px = Math.round(imagePoint.x);
      const y_px = Math.round(imagePoint.y);

      console.log("クリック位置(px):", x_px, y_px);

    });
  }
