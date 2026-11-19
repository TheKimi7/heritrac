// Browser checks. Built into build/test.html by build.mjs and run headless:
//   node build.mjs
//   google-chrome --headless=new --dump-dom file://$PWD/build/test.html
// It starts from the sample family, so running it discards whatever tree you
// had open.

// Headless Chrome saves to the real Downloads folder like any other Chrome,
// and a fresh --user-data-dir does not change that. The suite presses
// Download, so left alone it drops another copy of the family into the
// reader's Downloads on every single run. The anchor click is recorded and
// swallowed here instead. Nothing else about the save is faked: the blob is
// still made, so the content policy is still tested, and the app still marks
// the tree as saved.
var SAVED = [];
(function () {
  var real = HTMLElement.prototype.click;
  HTMLElement.prototype.click = function () {
    if (this.tagName === "A" && this.hasAttribute("download")) {
      SAVED.push(this.getAttribute("download"));
      return undefined;
    }
    return real.apply(this, arguments);
  };
})();
var SEEDED = JSON.stringify({
  format: "heritrac", version: 1,
  meta: { name: "The Hale family" },
  settings: { ego: "walter", pack: "english" },
  people: [{ id: "walter", name: "Walter Hale", sex: "M", birth: { year: 1968 } }],
  unions: []
});
try { localStorage.setItem("heritrac.tree.v2", SEEDED); } catch (e) {}
try { localStorage.setItem("heritrac.tree.v1", SEEDED); } catch (e) {}

var VIOLATIONS = [];
document.addEventListener("securitypolicyviolation", function (e) {
  VIOLATIONS.push(e.violatedDirective + " " + String(e.blockedURI).slice(0, 40));
});
window.__XSS__ = 0;

(function () {
  var errors = [];
  var observerNotices = 0;
  window.addEventListener("error", function (e) {
    var message = String(e.message);
    if (/ResizeObserver loop/.test(message)) { observerNotices++; return; }
    errors.push(message);
  });

  var out = [];
  var ok = function (label, cond, extra) {
    out.push((cond ? "PASS " : "FAIL ") + label + (extra === undefined ? "" : " :: " + extra));
  };
  var tick = function (ms) { return new Promise(function (r) { setTimeout(r, ms || 80); }); };
  var node = function (id) { return document.querySelector('[data-id="p:' + id + '"]'); };
  var term = function (id) {
    var n = node(id);
    var c = n && n.querySelector(".chip");
    return c ? c.textContent : "(missing)";
  };
  var warned = function (id) {
    var n = node(id);
    var c = n && n.querySelector(".chip");
    return !!c && c.className.indexOf("chip-warn") >= 0;
  };
  var cards = function () { return document.querySelectorAll(".card").length; };
  var names = function () {
    return Array.prototype.map.call(document.querySelectorAll(".card-name"), function (n) {
      return n.textContent;
    });
  };
  var panel = function () { return (document.querySelector(".detail") || document.body).textContent; };
  var click = function (el) { if (el) el.click(); return !!el; };
  // React keeps its own copy of what an input holds, so setting .value by
  // hand is ignored. Going through the prototype setter is what a real key
  // press ends up doing.
  var setValue = function (el, value) {
    var proto = el instanceof window.HTMLSelectElement ? window.HTMLSelectElement.prototype
      : el instanceof window.HTMLTextAreaElement ? window.HTMLTextAreaElement.prototype
      : window.HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value").set.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  };
  // React Flow listens for mouse events, so a simulated drag uses those.
  var centre = function (el) {
    var r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  };
  var mouse = function (el, type, p) {
    el.dispatchEvent(new MouseEvent(type, {
      bubbles: true, cancelable: true, composed: true, view: window, button: 0,
      buttons: type === "mouseup" ? 0 : 1, clientX: p.x, clientY: p.y, screenX: p.x, screenY: p.y
    }));
  };
  // A synthetic drag is a poor stand-in for a pointer, and React Flow decides
  // what a drag connected to from bookkeeping of its own rather than from the
  // DOM. One gesture takes about four times in five; see the retry at the call
  // site and the note there for what was ruled out.
  //
  // Everything stays inside one task deliberately. Spreading the moves over
  // frames lets autoPanOnConnect shift the canvas under the precomputed drop
  // point, which took the failure rate from about a fifth to three quarters.
  var dragTo = function (handle, target) {
    var from = centre(handle);
    var to = centre(target);
    mouse(handle, "mousedown", from);
    // Past connectionDragThreshold, so this reads as a drag and not a tap.
    mouse(document, "mousemove", { x: from.x + 14, y: from.y + 4 });
    for (var step = 1; step <= 8; step++) {
      mouse(document, "mousemove", {
        x: from.x + (to.x - from.x) * (step / 8),
        y: from.y + (to.y - from.y) * (step / 8)
      });
    }
    mouse(document, "mouseup", to);
  };
  var byText = function (root, text) {
    return [].slice.call((root || document).querySelectorAll("button"))
      .filter(function (b) { return b.textContent.trim().indexOf(text) === 0; })[0];
  };

  window.addEventListener("load", function () {
    setTimeout(async function () {
     try {
      ok("no script errors on load", errors.length === 0, errors.join(" | "));
      ok("everyone is drawn", cards() === 28, cards() + " cards");
      ok("couples are joined by a knot", document.querySelectorAll(".knot").length === 12,
        document.querySelectorAll(".knot").length + " knots");
      ok("generation rail is labelled", document.querySelectorAll(".bandrail span").length >= 3,
        document.querySelectorAll(".bandrail span").length + " labels");
      ok("a card offers all four sides",
        node("parantaka").querySelectorAll(".plus").length === 4,
        node("parantaka").querySelectorAll(".plus").length + " on Parantaka");
      ok("a card with two parents is not offered a third",
        node("rajaraja").querySelector(".plus-t").classList.contains("is-shut") &&
        !node("rajaraja").querySelector(".plus-t .plus-mark"));
      ok("but that side can still be dragged from",
        !!node("rajaraja").querySelector(".react-flow__handle.plus-t"));

      // the chrome: a name and a menu button at the top left, controls bottom right
      ok("the name sits top left", !!document.querySelector(".brandbar .brandname"));

      // React Flow's own corner badge is turned off in favour of a credit in
      // words. It is a replacement, so the library must still be named and
      // still be linked, and the check fails if the credit ever goes missing.
      var credit = document.querySelector(".credit");
      ok("react flow's corner badge is gone", !document.querySelector(".react-flow__attribution"));
      ok("a credit stands in for it", !!credit, credit && credit.textContent);
      ok("and it still names react flow",
        !!credit && credit.textContent.indexOf("React Flow") >= 0, credit && credit.textContent);
      ok("and still links to it",
        !!credit && (credit.querySelector("a") || {}).href === "https://reactflow.dev/",
        credit && (credit.querySelector("a") || {}).href);
      if (credit) {
        var cs = getComputedStyle(credit);
        var box = credit.getBoundingClientRect();
        var mid = Math.abs((box.left + box.width / 2) - window.innerWidth / 2);
        ok("it sits along the bottom", cs.position === "absolute" && parseInt(cs.bottom, 10) < 40, cs.bottom);
        ok("centred across the canvas", mid < 2, mid + "px off centre");
        ok("held at 30% opacity", cs.opacity === "0.3", cs.opacity);
        ok("and it never swallows a click meant for a card",
          cs.pointerEvents === "none", cs.pointerEvents);
        ok("though the link itself is still clickable",
          getComputedStyle(credit.querySelector("a")).pointerEvents === "auto");
      }
      var sideShown = function () {
        var el = document.querySelector(".side");
        return !el.hidden && getComputedStyle(el).display !== "none" && el.getBoundingClientRect().width > 0;
      };
      ok("the panel is open to start with on a wide screen", sideShown());
      click(document.getElementById("burger"));
      await tick(120);
      ok("the menu button hides the panel", !sideShown());
      click(document.getElementById("burger"));
      await tick(120);
      ok("and brings it back", sideShown());
      ok("the dock reads zoom in, zoom out, add, fit",
        [].map.call(document.querySelectorAll(".dock button"), function (b) { return b.id; }).join(",") ===
        "zoomin,zoomout,dockadd,fit",
        [].map.call(document.querySelectorAll(".dock button"), function (b) { return b.id; }).join(","));

      var transform = function () { return document.querySelector(".react-flow__viewport").style.transform; };
      var before = transform();
      click(document.getElementById("zoomin"));
      await tick(160);
      ok("zoom in works", transform() !== before, transform());
      click(document.getElementById("fit"));
      await tick(200);
      ok("fit works", transform() !== before, transform());

      ok("english by default", term("sundara") === "Father", term("sundara"));
      ok("cousin degree is computed", term("gandaradittan") === "Second cousin", term("gandaradittan"));
      ok("removal is computed", term("uttama") === "First cousin once removed", term("uttama"));
      ok("greats are counted", term("parantaka") === "Great-grandfather", term("parantaka"));
      ok("marriage makes an in-law", term("vandiyadevan") === "Brother-in-law", term("vandiyadevan"));

      // selecting somebody explains the answer
      click(node("narendra").querySelector(".card"));
      await tick();
      ok("panel opens", panel().indexOf("Rajaraja Narendra") >= 0);
      ok("best answer first", panel().indexOf("Grandson") >= 0);
      ok("the chain is shown", panel().indexOf("Kundavai") >= 0 && panel().indexOf(">") >= 0, panel().slice(0, 200));

      // the four plus buttons
      click(node("kulothunga").querySelector(".plus-b"));
      await tick();
      var form = document.querySelector(".addform");
      ok("the add form opens", !!form);
      ok("it offers the word and the sex together", !!byText(form, "Son") && !!byText(form, "Daughter"));
      click(byText(form, "Daughter"));
      setValue(form.querySelector(".addform-name"), "Nangai Devi");
      setValue(form.querySelector(".addform-year"), "2048");
      click(byText(form, "Add"));
      await tick(140);
      ok("the child is added", cards() === 29, cards() + " cards");
      ok("and named from the tree at once", term("nangai-devi") === "Great-great-granddaughter",
        term("nangai-devi"));
      ok("the form closes", !document.querySelector(".addform"));

      click(node("nangai-devi").querySelector(".plus-r"));
      await tick();
      form = document.querySelector(".addform");
      setValue(form.querySelector(".addform-name"), "Sam");
      click(byText(form, "Add"));
      await tick(140);
      ok("a partner can be added", cards() === 30 && !!node("sam"), cards() + " cards");

      click(node("sam").querySelector(".plus-l"));
      await tick();
      form = document.querySelector(".addform");
      setValue(form.querySelector(".addform-name"), "Robin");
      click(byText(form, "Add"));
      await tick(140);
      ok("a brother can be added to somebody with no parents on file",
        !!node("robin") && cards() === 31, cards() + " cards");

      click(node("sam").querySelector(".plus-t"));
      await tick();
      form = document.querySelector(".addform");
      setValue(form.querySelector(".addform-name"), "Pat");
      click(byText(form, "Add"));
      await tick(140);
      ok("a parent can be added", !!node("pat") && cards() === 32, cards() + " cards");
      click(document.getElementById("copy"));
      await tick(120);
      var mid = JSON.parse(document.querySelector(".sheet textarea").value);
      var patUnion = mid.unions.filter(function (u) { return u.spouses.indexOf("pat") >= 0; })[0];
      ok("the parent is attached to both siblings",
        !!patUnion && patUnion.children.indexOf("sam") >= 0 && patUnion.children.indexOf("robin") >= 0,
        patUnion ? patUnion.children.join(",") : "no union");
      // The JSON is a dialog, not a tray along the bottom: it has a backdrop,
      // it is centred, and the text scrolls inside it rather than stretching
      // the box past the window.
      {
        var dlg = document.querySelector(".sheet");
        var back = document.querySelector(".sheet-back");
        var ta = dlg.querySelector("textarea");
        var ds = getComputedStyle(dlg);
        ok("the json opens in a dialog", !!back && ds.position !== "fixed", ds.position);
        ok("and says so to a screen reader",
          dlg.getAttribute("role") === "dialog" && dlg.getAttribute("aria-modal") === "true");
        ok("it is labelled by the line above the text",
          dlg.getAttribute("aria-labelledby") === "sheetwhy" && !!document.getElementById("sheetwhy"));
        var db = dlg.getBoundingClientRect();
        ok("it never grows past the window",
          db.height <= window.innerHeight && db.width <= window.innerWidth,
          Math.round(db.width) + "x" + Math.round(db.height) + " in " + window.innerWidth + "x" + window.innerHeight);
        ok("it is centred", Math.abs((db.left + db.width / 2) - window.innerWidth / 2) < 2);
        ok("the family is long enough to need scrolling", ta.scrollHeight > ta.clientHeight,
          ta.scrollHeight + " of " + ta.clientHeight);
        ok("so the text scrolls inside it", getComputedStyle(ta).overflowY !== "visible");
        ta.scrollTop = 200;
        ok("and it actually moves", ta.scrollTop > 0, ta.scrollTop);
        ok("the buttons stay in view while it scrolls",
          document.getElementById("sheetclose").getBoundingClientRect().bottom <= db.bottom + 1);
        ok("the text is focused, ready to copy", document.activeElement === ta);

        // Nothing behind the dialog is reachable while it is up. The panel
        // and the cards still show through the backdrop, which is what a
        // backdrop is for, but no click can land on them.
        var escaped = [[40, 30], [window.innerWidth - 40, window.innerHeight - 30],
                       [4, Math.round(window.innerHeight / 2)], [Math.round(window.innerWidth / 2), 4]]
          .map(function (pt) { return document.elementFromPoint(pt[0], pt[1]); })
          .filter(function (el) { return !el || !(el === back || dlg.contains(el)); });
        ok("nothing behind it can be clicked", escaped.length === 0,
          escaped.map(function (el) { return el.className || el.tagName; }).join(", "));

        // Clicking the backdrop dismisses it; clicking the dialog does not.
        dlg.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
        await tick(120);
        ok("a click inside leaves it open", !!document.querySelector(".sheet"));
        back.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
        await tick(140);
        ok("a click on the backdrop closes it", !document.querySelector(".sheet"));
      }

      // Escape closes it too, and the key does nothing once it is shut.
      click(document.getElementById("copy"));
      await tick(140);
      ok("the dialog opens again", !!document.querySelector(".sheet"));
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      await tick(140);
      ok("escape closes it", !document.querySelector(".sheet"));

      // The confirm prompt is a question, not a document, so it stays a tray.
      ok("the confirm prompt is not a dialog", !document.querySelector(".sheet-back"));

      // a card of its own, then joined up from the panel
      click(document.getElementById("newcard"));
      await tick();
      form = document.querySelector(".addform");
      ok("the new card form opens", !!form);
      setValue(form.querySelector(".addform-name"), "Wren");
      click(byText(form, "Add"));
      await tick(180);
      ok("a card can be made on its own", !!node("wren") && cards() === 33, cards() + " cards");
      ok("and says it is not linked", term("wren") === "Not linked yet", term("wren"));
      ok("a loose card sits on your own row",
        Math.abs(node("wren").getBoundingClientRect().top - node("rajaraja").getBoundingClientRect().top) < 2,
        Math.round(node("wren").getBoundingClientRect().top - node("rajaraja").getBoundingClientRect().top) + "px off");

      click(node("rajaraja").querySelector(".card"));
      await tick();
      setValue(document.getElementById("linkkind"), "child");
      setValue(document.getElementById("linkwho"), "wren");
      click(document.getElementById("linkgo"));
      await tick(200);
      ok("linking from the panel works", term("wren") === "Son", term("wren"));

      // dragging one card onto another links them, with the same four meanings
      click(document.getElementById("dockadd"));
      await tick();
      ok("the add button in the corner opens the same form", !!document.querySelector(".addform"));
      click(byText(document.querySelector(".addform"), "Cancel"));
      await tick();
      click(document.getElementById("newcard"));
      await tick();
      form = document.querySelector(".addform");
      setValue(form.querySelector(".addform-name"), "Zed");
      click(byText(form, "Add"));
      await tick(200);
      click(document.getElementById("newcard"));
      await tick();
      form = document.querySelector(".addform");
      click(byText(form, "Woman"));
      setValue(form.querySelector(".addform-name"), "Quinn");
      click(byText(form, "Add"));
      await tick(240);
      ok("two loose cards are made", !!node("zed") && !!node("quinn") && cards() === 35, cards() + " cards");

      // Every card has to be on screen, not merely in the DOM. React Flow
      // holds a node at visibility:hidden until its ResizeObserver reports a
      // size, so a dropped notification used to leave a card invisible for
      // good: it still had a position and a bounding box, so counting cards
      // and measuring rectangles both passed while nothing was drawn and
      // nothing could be clicked. Dimensions are declared on the nodes now,
      // which is why this holds.
      var invisible = Array.prototype.filter.call(
        document.querySelectorAll(".react-flow__node"),
        function (n) { return getComputedStyle(n).visibility !== "visible"; }
      ).map(function (n) { return n.getAttribute("data-id"); });
      ok("and no card is hidden from the screen", invisible.length === 0, invisible.join(", "));

      // nothing may cover the canvas while a drag is simulated
      click(document.getElementById("burger"));
      await tick(140);
      var zedBox = node("zed").getBoundingClientRect();
      var quinnBox = node("quinn").getBoundingClientRect();
      ok("both are in view, side by side",
        zedBox.width > 0 && quinnBox.width > 0 && zedBox.left > 0 && quinnBox.left > 0 &&
        Math.abs(zedBox.left - quinnBox.left) > 100,
        Math.round(zedBox.left) + " and " + Math.round(quinnBox.left));

      // Hovering is what a real pointer does on the way in, and it is what
      // makes the side controls reachable.
      var side = node("zed").querySelector(".plus-r");
      node("zed").querySelector(".card").dispatchEvent(
        new MouseEvent("mouseover", { bubbles: true })
      );
      // React Flow decides whether a handle takes pointer events during a
      // render of its own, and hiding the panel just reflowed the canvas, so
      // the control can take a few frames to become reachable. Polled rather
      // than measured once: it still has to become true, it just is not
      // required to be true on the first frame.
      var hit = null;
      var sideBox = null;
      for (var attempt = 0; attempt < 40; attempt++) {
        // Nudge React Flow into re-measuring: it listens to the window, and a
        // resize is what it missed if the panel reflow outran its observer.
        if (attempt && attempt % 8 === 0) window.dispatchEvent(new Event("resize"));
        sideBox = side.getBoundingClientRect();
        hit = side.classList.contains("connectionindicator")
          ? document.elementFromPoint(
              sideBox.left + sideBox.width / 2,
              sideBox.top + sideBox.height / 2
            )
          : null;
        if (hit && (hit.classList.contains("plus") || hit.classList.contains("plus-mark"))) break;
        await tick(50);
      }
      // KNOWN INTERMITTENT, cause not found. Roughly one run in five this
      // fails with the handle reporting connectable=true and sitting at a
      // sensible position, while elementFromPoint at its centre returns the
      // canvas pane instead. 40 polls over two seconds and a synthetic resize
      // do not recover it, so it is not the test being impatient. A
      // ResizeObserver loop notice sometimes accompanies it and sometimes
      // does not, so that is a correlation at best, not the cause. Predates
      // the privacy and policy work. The extras below are printed to narrow
      // it down next time.
      ok("the side control is what the pointer finds",
        !!hit && (hit.classList.contains("plus") || hit.classList.contains("plus-mark")),
        (hit ? hit.className : "nothing") + " at " +
        Math.round(sideBox.left) + "," + Math.round(sideBox.top) +
        " after " + attempt + " tries, connectable=" + side.classList.contains("connectionindicator") +
        ", " + observerNotices + " resize notices");

      // Retried because the synthetic gesture is unreliable here, not the
      // behaviour it checks. What the investigation established, in case it
      // comes back:
      //
      //   - About one full run in six, React Flow never starts a connection
      //     at all: onConnect and onConnectEnd are both never invoked. It is
      //     not the drop being misread, it is the press being ignored.
      //   - It is sticky within a page load. All four retries fail together
      //     or the first one works.
      //   - The same gesture on a fresh page with nothing before it passed 20
      //     times out of 20, so it is accumulated state from earlier in this
      //     run, not the gesture itself.
      //   - At mouseup the handle is hit-testable and carries
      //     connectionindicator, the pointer is over the target card, and the
      //     viewport has not moved. A phase-by-phase dump is byte-for-byte
      //     identical whether the gesture takes or not.
      //   - Every timing change made it worse. Waiting between the moves took
      //     it to three quarters failing, because autoPanOnConnect then moves
      //     the canvas under the precomputed drop point. A longer settle
      //     beforehand took it to half. More intermediate moves changed
      //     nothing.
      //
      // Never reproduced with a real pointer, and a real pointer cannot
      // produce this event shape. The next step would be driving it through
      // the devtools protocol, which generates genuine input events, to settle
      // whether synthetic events are the whole story.
      //
      // A knot appears the moment two people are joined, which is the cheap
      // way to tell whether the gesture took.
      var knots = function () { return document.querySelectorAll(".knot").length; };
      var knotsBefore = knots();
      var attempts = 0;
      for (attempts = 1; attempts <= 4; attempts++) {
        dragTo(side, node("quinn").querySelector(".card"));
        await tick(280);
        if (knots() > knotsBefore) break;
      }
      click(document.getElementById("copy"));
      await tick(140);
      var after = JSON.parse(document.querySelector(".sheet textarea").value);
      var married = after.unions.filter(function (u) {
        return u.spouses.indexOf("zed") >= 0 && u.spouses.indexOf("quinn") >= 0;
      }).length;
      ok("dragging from a side links the two cards", married === 1,
        married + " unions joining them after " + attempts + " attempts");
      ok("and one drag is usually enough", attempts <= 2, attempts + " attempts needed");
      click(byText(document.querySelector(".sheet"), "Close"));
      click(document.getElementById("burger"));
      await tick(140);
      ok("the panel comes back after the drag", sideShown());

      // a loose card is not the same as somebody too far away
      ok("a card nobody has joined up says so", term("quinn") === "Not linked yet", term("quinn"));
      ok("and is not greyed out like a distant relative",
        !node("quinn").querySelector(".card").classList.contains("is-faded"));

      // editing a person, and undoing a link
      click(node("quinn").querySelector(".card"));
      await tick();
      setValue(document.getElementById("pname"), "Quinn Marsh");
      setValue(document.getElementById("pyear"), "05-11-1994");
      click(document.getElementById("psave"));
      await tick(200);
      ok("a name can be corrected", node("quinn").querySelector(".card-name").textContent === "Quinn Marsh",
        node("quinn").querySelector(".card-name").textContent);
      ok("and a birth date shows as an age", !!node("quinn").querySelector(".card-age"));
      var years = new Date().getFullYear() - 1994 - (new Date() < new Date(new Date().getFullYear(), 10, 5) ? 1 : 0);
      ok("the age counts from the day, not the year",
        node("quinn").querySelector(".card-age").textContent === String(years),
        node("quinn").querySelector(".card-age").textContent + " expected " + years);
      document.querySelector(".react-flow__pane").click();
      await tick(120);
      click(node("quinn").querySelector(".card"));
      await tick(120);
      ok("the whole date reads back the way it was typed",
        document.getElementById("pyear").value === "05-11-1994", document.getElementById("pyear").value);
      ok("and the panel prints it", panel().indexOf("05-11-1994") >= 0);
      setValue(document.getElementById("pyear"), "1994");
      click(document.getElementById("psave"));
      await tick(180);
      document.querySelector(".react-flow__pane").click();
      await tick(120);
      click(node("quinn").querySelector(".card"));
      await tick(120);
      ok("a year on its own is allowed too", document.getElementById("pyear").value === "1994",
        document.getElementById("pyear").value);

      ok("the links are listed", !!document.querySelector('[data-unlink="zed"]'));
      click(document.querySelector('[data-unlink="zed"]'));
      await tick(220);
      click(document.getElementById("copy"));
      await tick(140);
      var undone = JSON.parse(document.querySelector(".sheet textarea").value);
      ok("a link can be undone",
        undone.unions.filter(function (u) {
          return u.spouses.indexOf("zed") >= 0 && u.spouses.indexOf("quinn") >= 0;
        }).length === 0);
      ok("and nobody was deleted to do it", undone.people.length === 35, undone.people.length + " people");
      click(byText(document.querySelector(".sheet"), "Close"));
      await tick();

      // There is no distance slider any more. It only ever dimmed cards, and
      // its default greyed out anybody more than five steps off, which in a
      // large family is nearly everyone. Now only a person the app could not
      // work out a word for fades back.
      ok("there is no distance slider", !document.getElementById("reach"));
      ok("a distant relative is still named",
        term("uttama") === "First cousin once removed", term("uttama"));
      ok("and is not dimmed for being distant",
        !node("uttama").querySelector(".card").classList.contains("is-faded"));
      ok("nor is close family", !node("sundara").querySelector(".card").classList.contains("is-faded"));
      var dimmed = Array.prototype.filter.call(document.querySelectorAll(".card"), function (c) {
        return c.classList.contains("is-faded");
      });
      ok("nobody in a family this size is dimmed at all", dimmed.length === 0, dimmed.length + " faded");

      // words of your own, and the sets you can load them from
      var pinned = function (id) {
        var c = node(id) && node(id).querySelector(".chip");
        return !!c && c.className.indexOf("chip-pin") >= 0;
      };
      ok("there is no naming system to choose", !document.getElementById("pack"));
      ok("the family is named in English", term("sundara") === "Father", term("sundara"));
      ok("and an English word is not marked as yours", !pinned("sundara"));

      click(document.getElementById("words-tamil"));
      await tick(220);
      ok("loading the Tamil words renames the family", term("sundara") === "Appa", term("sundara"));
      ok("and they count as words of yours", pinned("sundara"));
      // The reason the Tamil rules are asked rather than the English ones
      // translated: Tamil reduces both of these to somebody closer, so these
      // words are not ones an English reading could ever reach.
      ok("a second cousin comes out a brother", term("gandaradittan") === "Annan", term("gandaradittan"));
      ok("a first cousin once removed comes out Periyappa", term("uttama") === "Periyappa", term("uttama"));
      ok("a great-grandfather has his own word", term("parantaka") === "Kollu thatha", term("parantaka"));
      // Nothing the rules are unsure of is written in. An override is plain
      // text with no flag on it, so writing one would put a word this app is
      // not confident about into the reader's file as if they had typed it.
      ok("a word the rules are unsure of is left in English",
        term("rajaditya") === "Great-uncle", term("rajaditya"));
      ok("and it is not passed off as yours", !pinned("rajaditya"));
      ok("the toast says what was left behind",
        (document.querySelector(".toast") || {}).textContent.indexOf("to check") > 0,
        (document.querySelector(".toast") || {}).textContent);
      ok("loading words is a change worth saving", !!document.getElementById("unsaved"));

      // The selected card's box is uncontrolled, so a bulk load has to reach it.
      click(node("sundara").querySelector(".card"));
      await tick(140);
      ok("the selected card shows its loaded word",
        document.getElementById("ovr").value === "Appa",
        document.getElementById("ovr").value);
      setValue(document.getElementById("ovr"), "Appaji");
      click(document.getElementById("ovrsave"));
      await tick(200);
      ok("a word you type yourself replaces it", term("sundara") === "Appaji", term("sundara"));
      click(document.getElementById("words-tamil"));
      await tick(220);
      ok("and loading again keeps it", term("sundara") === "Appaji", term("sundara"));

      // Loading never writes over a word that is already there, so asking for
      // the script while the romanised words are in place is refused rather
      // than obeyed. That is the same rule that protects a word you typed.
      click(document.getElementById("words-tamil-script"));
      await tick(220);
      ok("the script is not forced over words already there",
        term("kundavai") === "Akka", term("kundavai"));
      ok("and it says so rather than doing nothing",
        (document.querySelector(".toast") || {}).textContent.indexOf("already named") >= 0,
        (document.querySelector(".toast") || {}).textContent);

      click(document.getElementById("words-clear"));
      await tick(220);
      ok("clearing takes the lot away", term("sundara") === "Father", term("sundara"));
      ok("including the one you typed", !pinned("sundara"));
      ok("and the box empties with them", document.getElementById("ovr").value === "",
        document.getElementById("ovr").value);

      click(document.getElementById("words-tamil-script"));
      await tick(220);
      ok("the script button writes Tamil letters once there is room",
        /[\u0b80-\u0bff]/.test(term("kundavai")), term("kundavai"));
      click(document.getElementById("words-clear"));
      await tick(220);
      ok("and back to English again", term("sundara") === "Father", term("sundara"));

      // viewing as somebody else
      click(node("narendra").querySelector(".card"));
      await tick();
      click(byText(document.querySelector(".detail"), "View as this person"));
      await tick(160);
      ok("viewpoint moved", document.querySelector(".viewing b").textContent === "Rajaraja Narendra",
        document.querySelector(".viewing b").textContent);
      ok("the old viewpoint is now his grandfather", term("rajaraja") === "Grandfather", term("rajaraja"));
      ok("his father", term("vimaladitya") === "Father", term("vimaladitya"));
      ok("his son", term("kulothunga") === "Son", term("kulothunga"));

      // his wife is also his first cousin, so the panel owes you both answers
      click(node("rajadhiraja").querySelector(".card"));
      await tick(140);
      ok("best answer first", panel().indexOf("Brother-in-law") >= 0, panel().slice(0, 160));
      ok("the other answer is offered", panel().indexOf("First cousin") >= 0, panel().slice(0, 300));

      // a pinned word survives an unrelated deletion
      click(node("rajaraja").querySelector(".card"));
      await tick();
      var ovr = document.getElementById("ovr");
      setValue(ovr, "TESTPIN");
      click(document.getElementById("ovrsave"));
      await tick(140);
      ok("pin applied", term("rajaraja") === "TESTPIN", term("rajaraja"));
      click(node("madhurantaki").querySelector(".card"));
      await tick();
      click(byText(document.querySelector(".detail"), "Remove"));
      await tick(160);
      ok("person removed", !node("madhurantaki") && cards() === 34, cards() + " cards");
      ok("unrelated pin survived", term("rajaraja") === "TESTPIN", term("rajaraja"));

      // the file
      click(document.getElementById("copy"));
      await tick(120);
      var text = document.querySelector(".sheet textarea").value;
      var parsed = null;
      try { parsed = JSON.parse(text); } catch (e) { /* reported below */ }
      ok("file is valid json", !!parsed);
      ok("file carries people and unions", !!parsed && parsed.people.length === 34 && parsed.unions.length > 0,
        parsed ? parsed.people.length + " people" : "");
      ok("no worked out terms are stored", !!parsed && text.indexOf("Brother-in-law") < 0);
      ok("but your own words are", !!parsed && text.indexOf("TESTPIN") > 0);
      click(byText(document.querySelector(".sheet"), "Close"));
      await tick();

      click(document.getElementById("blank"));
      await tick(160);
      ok("empty tree has one person", cards() === 1, cards() + " cards");
      click(document.getElementById("sample"));
      await tick(200);
      ok("sample reloads", cards() === 28, cards() + " cards");

      /* ------------------------------------------- nothing is kept here */

      // A tree was seeded under both storage keys before the app loaded.
      ok("a tree saved by an older build is ignored", names().indexOf("Walter Hale") < 0, names().slice(0, 3).join(", "));
      ok("and it is cleared from this browser", localStorage.getItem("heritrac.tree.v2") === null);
      ok("including keys from any earlier version", localStorage.getItem("heritrac.tree.v1") === null);
      /* ------------------------------------- warning before the tab shuts */

      var leaving = function () {
        var e = new Event("beforeunload", { cancelable: true });
        window.dispatchEvent(e);
        return e.defaultPrevented;
      };
      ok("a clean page does not warn on exit", !leaving());

      var keysBefore = localStorage.length;
      var edit = async function (who, name) {
        click(node(who).querySelector(".card"));
        await tick();
        setValue(document.getElementById("pname"), name);
        click(document.getElementById("psave"));
        await tick(220);
      };
      await edit("rajendra", "Rajendra Edited");
      ok("the edit took", names().indexOf("Rajendra Edited") >= 0, names().slice(0, 3).join(", "));
      ok("and editing writes nothing back to storage", localStorage.length === keysBefore,
        localStorage.length + " keys");
      ok("an edit shows the unsaved marker", !!document.getElementById("unsaved"));
      ok("and warns on exit", leaving());
      ok("and the panel says nothing is stored",
        /Download or copy/.test((document.getElementById("privacy") || {}).textContent || ""));
      click(document.getElementById("copy"));
      await tick(160);
      click(byText(document.querySelector(".sheet"), "Close"));
      await tick();
      ok("copying it counts as saving", !leaving());
      ok("and the marker clears", !document.getElementById("unsaved"));

      // Download is the only way the reader keeps anything, now that nothing
      // is stored, so the blob path has to survive the policy. This page is
      // top level, so embedded() is false and the save path runs in full; the
      // stub at the top of this file catches the file itself.
      var vBefore = VIOLATIONS.length;
      SAVED.length = 0;
      await edit("rajendra", "Rajendra Downloaded");
      ok("the page is not embedded here", !!document.getElementById("dl"));
      click(document.getElementById("dl"));
      await tick(300);
      ok("downloading reports that it saved",
        /downloads/i.test((document.querySelector(".toast") || {}).textContent || ""),
        (document.querySelector(".toast") || {}).textContent);
      ok("and the policy did not block the blob", VIOLATIONS.length === vBefore,
        VIOLATIONS.join(" | "));
      ok("and downloading counts as saving", !leaving());
      ok("the file is named after the family, once",
        SAVED.length === 1 && /^[a-z0-9][a-z0-9-]*\.json$/.test(SAVED[0]), SAVED.join(", "));

      /* --------------------- replacing a family asks before it is lost */

      await edit("rajendra", "Edited Again");
      ok("the second edit took", names().indexOf("Edited Again") >= 0, names().slice(0, 3).join(", "));
      click(document.getElementById("sample"));
      await tick(160);
      ok("replacing unsaved work asks first", !!document.getElementById("confirmbar"));
      ok("and has not replaced anything yet",
        names().indexOf("Edited Again") >= 0 && cards() === 28, cards() + " cards");
      click(document.getElementById("confirm-no"));
      await tick(120);
      ok("cancelling leaves the edit alone", !document.getElementById("confirmbar") && leaving());
      click(document.getElementById("sample"));
      await tick(160);
      click(document.getElementById("confirm-go"));
      await tick(250);
      ok("going ahead loads the sample",
        cards() === 28 && names().indexOf("Edited Again") < 0 && !leaving(),
        cards() + " cards, " + names().slice(0, 3).join(", "));

      /* ------------------------------------------- injection and the CSP */

      // A name is data, never markup. React escapes it; this proves it rather
      // than trusting it.
      var payload = '<img src=x onerror="window.__XSS__=1">';
      click(document.getElementById("paste"));
      await tick(160);
      if (document.getElementById("confirm-go")) { click(document.getElementById("confirm-go")); await tick(160); click(document.getElementById("paste")); await tick(160); }
      document.getElementById("sheettext").value = JSON.stringify({
        format: "heritrac", version: 1,
        settings: { ego: "x" },
        people: [{ id: "x", name: payload, sex: "M" }],
        unions: []
      });
      click(byText(document.querySelector(".sheet"), "Load this"));
      await tick(400);
      ok("a markup name renders as text", term("x") === "You" && names()[0] === payload, names()[0]);
      ok("and no image was injected", !document.querySelector(".card img"));
      ok("and nothing ran", window.__XSS__ === 0);

      // An inline script with no hash in the policy must not run.
      var before = VIOLATIONS.length;
      var bad = document.createElement("script");
      bad.textContent = "window.__XSS__=2";
      document.body.appendChild(bad);
      await tick(200);
      ok("an injected inline script is blocked by the policy", window.__XSS__ === 0, window.__XSS__);
      ok("and the block is reported", VIOLATIONS.length > before, VIOLATIONS.join(" | "));

      // The whole run under the production policy, with only the injection
      // above accounted for. Anything else means the policy breaks the app.
      ok("the policy blocked nothing the app needs", VIOLATIONS.length === before + 1,
        VIOLATIONS.join(" | "));

      // A long name wraps and is shown whole. Nothing is ever cut short with
      // an ellipsis, and the card keeps the size React Flow was told it has
      // whatever is written on it, because a card whose real height differed
      // from the declared one would put its handles in the wrong place.
      {
        // Whoever is on screen by this point: the run has changed viewpoint,
        // reach and the family itself, so no particular person is guaranteed.
        if (!sideShown()) { click(document.getElementById("burger")); await tick(200); }
        var someone = document.querySelector('.react-flow__node[data-id^="p:"]');
        var who = someone.getAttribute("data-id").slice(2);
        var plain = someone.querySelector(".card");
        // offsetWidth, not a bounding rect: the canvas is under a transform
        // whose scale changes through the run, so a rect is in screen pixels
        // and would compare two different zoom levels.
        var wasH = plain.offsetHeight;
        var wasW = plain.offsetWidth;
        var longName = "Pazhuvettaraiyar Periya Sundara Chola Thevar Narpavi";
        await edit(who, longName);
        var el = node(who).querySelector(".card-name");
        var card = node(who).querySelector(".card");
        var cs = getComputedStyle(el);
        ok("a long name is kept whole", el.textContent === longName, el.textContent);
        ok("and is never cut short with an ellipsis", cs.textOverflow !== "ellipsis", cs.textOverflow);
        ok("it is allowed to wrap", cs.whiteSpace !== "nowrap", cs.whiteSpace);
        // offsetHeight again, for the same reason: a rect here is in screen
        // pixels and the font size it is compared against is not.
        ok("so it takes more than one line",
          el.offsetHeight > parseFloat(cs.fontSize) * 1.6,
          el.offsetHeight + "px tall at " + cs.fontSize);
        ok("the name stays inside the card",
          el.getBoundingClientRect().right <= card.getBoundingClientRect().right + 1 &&
          el.getBoundingClientRect().bottom <= card.getBoundingClientRect().bottom + 1);
        ok("and the card is the same size as before",
          card.offsetHeight === wasH && card.offsetWidth === wasW,
          card.offsetWidth + "x" + card.offsetHeight + ", was " + wasW + "x" + wasH);
        ok("which is the size react flow was told",
          card.offsetHeight === 86 && card.offsetWidth === 212,
          card.offsetWidth + "x" + card.offsetHeight);
        // One unbroken word has nowhere to break, so it needs the harder rule.
        await edit(who, "Aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
        var solid = node(who).querySelector(".card-name");
        ok("one long unbroken word still stays inside the card",
          solid.getBoundingClientRect().right <=
            node(who).querySelector(".card").getBoundingClientRect().right + 1,
          Math.round(solid.getBoundingClientRect().width) + "px wide");
      }

      // Somebody can be known to have died with nobody knowing when.
      {
        if (!sideShown()) { click(document.getElementById("burger")); await tick(200); }
        var alive = document.querySelector('.react-flow__node[data-id^="p:"]');
        var pid = alive.getAttribute("data-id").slice(2);
        click(node(pid).querySelector(".card"));
        await tick(160);
        ok("a person can be marked dead without a year", !!document.getElementById("pliving"));
        var corner = function () {
          var el = node(pid).querySelector(".card-age");
          return el ? el.textContent : "";
        };
        var dashed = function () {
          return getComputedStyle(node(pid).querySelector(".card")).borderStyle === "dashed";
        };
        setValue(document.getElementById("pdeath"), "");
        setValue(document.getElementById("pliving"), "dead");
        click(document.getElementById("psave"));
        await tick(260);
        ok("the card says so", corner() === "died", corner());
        ok("and is drawn as somebody who has died", dashed());
        ok("the panel says the year is not known",
          document.querySelector(".detail .kv").textContent.indexOf("Year not known") >= 0);
        ok("no age is shown for them",
          document.querySelector(".detail .kv").textContent.indexOf("age") < 0,
          document.querySelector(".detail .kv").textContent);

        // A year of death says the same thing and more, so it takes over and
        // the form stops claiming they are living.
        setValue(document.getElementById("pdeath"), "1999");
        click(document.getElementById("psave"));
        await tick(260);
        ok("a year of death replaces the marker", corner() === "d. 1999", corner());
        ok("and the form agrees", document.getElementById("pliving").value === "dead",
          document.getElementById("pliving").value);
        click(document.getElementById("copy"));
        await tick(160);
        var saved = JSON.parse(document.querySelector(".sheet textarea").value);
        var him = saved.people.filter(function (p) { return p.id === pid; })[0];
        ok("and only one of the two is written to the file",
          him && him.death && him.death.year === 1999 && him.dead === undefined,
          JSON.stringify(him && { death: him.death, dead: him.dead }));
        click(document.getElementById("sheetclose"));
        await tick(160);

        // Back to living again.
        setValue(document.getElementById("pdeath"), "");
        setValue(document.getElementById("pliving"), "living");
        click(document.getElementById("psave"));
        await tick(260);
        ok("they can be marked living again", corner() !== "died" && corner().indexOf("d. ") !== 0, corner());
        ok("and are no longer drawn as dead", !dashed());
      }

      // ---- Clear chart, the X beside it, and the tour ----
      // One action behind two controls, so both are pressed, and the
      // confirmation that stands in front of unsaved work is checked on the
      // quick one rather than only on the buried one.
      var blank = document.getElementById("blank");
      ok("the panel button says Clear chart", blank && blank.textContent === "Clear chart",
        blank ? blank.textContent : "missing");
      var xbtn = document.getElementById("clear");
      ok("an X in the corner does the same thing",
        !!xbtn && xbtn.getAttribute("aria-label") === "Clear chart",
        xbtn ? xbtn.getAttribute("aria-label") : "missing");

      // Start from a freshly loaded sample. Earlier checks leave unsaved work
      // behind, so the first press is met by the confirmation and answered.
      click(document.getElementById("sample"));
      await tick(240);
      if (document.getElementById("confirm-go")) click(document.getElementById("confirm-go"));
      await tick(400);
      ok("a freshly loaded sample counts as saved", !document.getElementById("unsaved"),
        document.getElementById("unsaved") ? "still marked unsaved" : "clean");
      click(document.getElementById("clear"));
      await tick(340);
      ok("the X clears an untouched sample without asking",
        !document.getElementById("confirmbar") && document.querySelectorAll(".card").length === 1,
        document.querySelectorAll(".card").length + " cards, bar " +
          (document.getElementById("confirmbar") ? "shown" : "absent"));

      // Now there is something to lose, so the same button has to stop.
      click(node("me").querySelector(".card"));
      await tick(200);
      setValue(document.getElementById("pname"), "Someone Else");
      click(document.getElementById("psave"));
      await tick(260);
      ok("editing marks the tree unsaved", !!document.getElementById("unsaved"));
      click(document.getElementById("clear"));
      await tick(300);
      ok("so the X asks first once there is unsaved work",
        !!document.getElementById("confirmbar"));
      click(document.getElementById("confirm-no"));
      await tick(200);
      ok("and cancelling leaves the family alone",
        !!node("me") && node("me").querySelector(".card-name").textContent === "Someone Else",
        node("me") ? node("me").querySelector(".card-name").textContent : "gone");

      // The tour. A step whose target measures zero would leave the ring in
      // the top corner pointing at nothing, which is exactly how a step
      // inside the closed panel fails, so every step is measured.
      var sideWas = !document.querySelector(".side").hidden;
      var storeBefore = localStorage.length + ":" + sessionStorage.length;
      click(document.getElementById("tour"));
      await tick(360);
      ok("the tour opens on demand", !!document.getElementById("tourbubble"));
      var steps = 0, badSteps = [];
      while (document.getElementById("tourbubble") && steps < 20) {
        steps++;
        var ring = document.getElementById("tourring");
        if (!ring) badSteps.push("step " + steps + " rings nothing");
        else {
          var rr = ring.getBoundingClientRect();
          if (rr.width < 10 || rr.height < 10) {
            badSteps.push("step " + steps + " ring " + (rr.width | 0) + "x" + (rr.height | 0));
          }
        }
        var nx = document.getElementById("tournext");
        if (!nx) break;
        click(nx);
        await tick(380);
      }
      ok("every tour step rings something with a real size", badSteps.length === 0,
        badSteps.join(" | "));
      ok("the tour runs through all of its steps and closes",
        steps === 8 && !document.getElementById("tourbubble"), steps + " steps");

      click(document.getElementById("tour"));
      await tick(340);
      ok("it can be opened again", !!document.getElementById("tourbubble"));
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      await tick(300);
      ok("escape leaves the tour", !document.getElementById("tourbubble"));
      ok("and the panel is left the way it was found",
        (!document.querySelector(".side").hidden) === sideWas,
        "was " + sideWas + ", now " + (!document.querySelector(".side").hidden));
      ok("the tour wrote nothing to storage",
        (localStorage.length + ":" + sessionStorage.length) === storeBefore,
        storeBefore + " before, " + localStorage.length + ":" + sessionStorage.length + " after");

      ok("still no script errors", errors.length === 0, errors.join(" | "));
      ok("and the canvas settled without a stuck resize loop", observerNotices < 3,
        observerNotices + " ResizeObserver notices");
      try { localStorage.clear(); } catch (e) {}
     } catch (err) {
      out.push("FAIL the run stopped :: " + (err && err.stack ? err.stack.split("\n").slice(0, 3).join(" ") : err));
     }
      var pre = document.createElement("pre");
      pre.id = "testresults";
      pre.textContent = out.join("\n");
      document.body.appendChild(pre);
    }, 900);
  });
})();
