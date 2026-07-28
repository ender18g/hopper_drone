import katex from "katex";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const Prism = require("prismjs");
require("prismjs/components/prism-python");

const VERIFIED_DATE = "28 July 2026";

const escapeHtml = (value) =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

const math = (latex, displayMode = false) =>
  katex.renderToString(latex, {
    displayMode,
    output: "mathml",
    throwOnError: true,
    strict: "error",
  });

const equation = (latex, caption, compact = false) => `
  <div class="lesson-equation${compact ? " lesson-equation--compact" : ""}">
    ${math(latex, true)}
    ${caption ? `<p class="lesson-equation__caption">${caption}</p>` : ""}
  </div>`;

const codeBlock = (language, title, source) => {
  const grammar = Prism.languages[language];
  if (!grammar) throw new Error(`Missing Prism grammar: ${language}`);
  return `
    <figure class="lesson-code">
      <figcaption class="lesson-code__bar">
        <span>${escapeHtml(title)} · ${escapeHtml(language)}</span>
        <button class="lesson-copy" type="button" data-copy-code>Copy</button>
      </figcaption>
      <pre><code class="language-${escapeHtml(language)}">${Prism.highlight(source.trim(), grammar, language)}</code></pre>
    </figure>`;
};

const callout = (title, body, kind = "") => `
  <aside class="lesson-callout${kind ? ` lesson-callout--${kind}` : ""}">
    <div><b>${title}</b><p>${body}</p></div>
  </aside>`;

const cards = (items, columns = 2) => `
  <div class="lesson-cards${columns === 3 ? " lesson-cards--three" : ""}">
    ${items.map(({ tag, title, body }) => `
      <article class="lesson-card">
        ${tag ? `<span class="lesson-card__tag">${tag}</span>` : ""}
        <h3>${title}</h3>
        <p>${body}</p>
      </article>`).join("")}
  </div>`;

const table = (headers, rows) => `
  <div class="lesson-table-wrap" role="region" aria-label="${escapeHtml(headers.join(", "))}" tabindex="0">
    <table class="lesson-table">
      <thead><tr>${headers.map((header) => `<th scope="col">${header}</th>`).join("")}</tr></thead>
      <tbody>${rows.map((row) => `<tr>${row.map((cell) => `<td>${cell}</td>`).join("")}</tr>`).join("")}</tbody>
    </table>
  </div>`;

const apiList = (items) => `
  <div class="lesson-api">
    ${items.map(({ signature, label, detail }) => `
      <article class="lesson-api__item">
        <div class="lesson-api__signature">${escapeHtml(signature)}</div>
        <div class="lesson-api__detail"><b>${label}</b><p>${detail}</p></div>
      </article>`).join("")}
  </div>`;

const check = (question, answer) => `
  <details class="lesson-check">
    <summary>Check your understanding · ${question}</summary>
    <div class="lesson-check__answer">${answer}</div>
  </details>`;

const source = (title, url, note = "") => ({ title, url, note });

const lesson = ({
  number,
  slug,
  kicker,
  title,
  summary,
  duration,
  level,
  objectives,
  sections,
  sources,
  accent = "teal",
}) => ({
  number,
  slug,
  kicker,
  title,
  summary,
  duration,
  level,
  objectives,
  sections,
  sources,
  accent,
  verified: VERIFIED_DATE,
});

export const lessons = [
  lesson({
    number: "01",
    slug: "01-hopper-sensor-suite",
    kicker: "Observe before you automate",
    title: "The Hopper sensor suite",
    summary:
      "Learn what can actually be seen on the classroom aircraft, what the flight controller must estimate, and how to describe sensors without turning inference into fact.",
    duration: "18 min",
    level: "Foundations",
    objectives: [
      "Separate the camera used for classroom vision from the sensors used to stabilize flight.",
      "Identify the externally visible camera and downward-facing modules without overclaiming their modality.",
      "Explain why position and attitude are estimates produced by sensor fusion.",
      "Design a measurement check that is safe, repeatable, and honest about uncertainty.",
    ],
    sections: [
      {
        id: "two-systems",
        title: "Two sensing systems share one aircraft",
        html: `
          <p class="lesson-lede">A quadrotor has to answer two different questions at once: “How am I moving?” and “What is in the image?” Hopper Studio keeps those jobs separate.</p>
          ${cards([
            {
              tag: "Flight loop",
              title: "Stabilization sensing",
              body: "The flight controller continuously estimates attitude and motion, then adjusts the four motors. This loop must keep working even when your lesson code is idle.",
            },
            {
              tag: "Lesson loop",
              title: "Camera vision",
              body: "Hopper Studio captures pixels, then runs thresholding, COCO-SSD, a Teachable Machine classifier, or AprilTag detection on the host computer.",
            },
          ])}
          <p>The important distinction is computational: the classroom vision algorithms run in the browser or desktop app. They are not proof that a neural network is running on the aircraft. Likewise, a camera frame is not a direct reading of altitude, velocity, or heading.</p>
          ${callout(
            "Evidence rule",
            "The supplied photographs are strong evidence for visible hardware. They are not sufficient evidence for an internal IMU, barometer, compass, GPS receiver, or a particular range-sensing technology. Those claims require hardware documentation.",
            "caution",
          )}
        `,
      },
      {
        id: "anatomy",
        title: "Read the underside like a scientist",
        html: `
          <p class="lesson-lede">The generated illustration below is based on the supplied 4032 × 3024 underside photograph. Numbered labels are HTML overlays so the wording stays exact and accessible.</p>
          <figure class="lesson-figure">
            <div class="lesson-figure__frame">
              <img src="assets/images/hopper-underbody-generated.jpg" width="1536" height="1024" alt="Generated technical underside view of the black X-frame Hopper quadrotor with red propeller guards">
              <span class="sensor-callout sensor-callout--1" aria-hidden="true">1</span>
              <span class="sensor-callout sensor-callout--2" aria-hidden="true">2</span>
              <span class="sensor-callout sensor-callout--3" aria-hidden="true">3</span>
              <span class="sensor-callout sensor-callout--4" aria-hidden="true">4</span>
            </div>
            <figcaption><strong>Generated technical illustration.</strong> It is a diagrammatic rendering of the supplied high-resolution photo, not a manufacturer cutaway.</figcaption>
          </figure>
          ${cards([
            {
              tag: "1 · visible",
              title: "Downward-facing camera assembly",
              body: "A lens and exposed circuit assembly are clearly visible. The photo establishes location and orientation, but not resolution, frame rate, field of view, or whether this is the exact feed used by Hopper Studio.",
            },
            {
              tag: "2 · visible",
              title: "Secondary optical-looking package",
              body: "A smaller package is visible next to the main lens. Its appearance alone does not prove optical-flow, infrared, or another specific function.",
            },
            {
              tag: "3 · visible",
              title: "Square downward-facing window",
              body: "A square downward-facing window is visible on the centerline. Its shape does not establish what is behind it; a manual or instrumented test is needed before calling it a range sensor or naming a sensing technology.",
            },
            {
              tag: "4 · visible",
              title: "Motor, propeller, and guard",
              body: "Each arm carries one motor and two-blade propeller. The red guards are safety hardware, not sensors, but they change mass, drag, and collision behavior.",
            },
          ])}
          <div class="lesson-photo-grid">
            <figure class="lesson-figure">
              <div class="lesson-figure__frame"><img src="assets/images/hopper-underbody-photo.jpg" width="1600" height="2134" alt="High-resolution supplied photograph of the Hopper underside"></div>
              <figcaption>Supplied high-resolution underside photograph, resized and re-encoded for the web.</figcaption>
            </figure>
            <figure class="lesson-figure">
              <div class="lesson-figure__frame"><img src="assets/images/hopper-top-photo.jpg" width="1600" height="2134" alt="High-resolution supplied photograph of the top of the Hopper quadrotor"></div>
              <figcaption>Supplied top photograph. It confirms the X-frame layout and battery shell, but reveals no additional identifiable sensor.</figcaption>
            </figure>
          </div>
        `,
      },
      {
        id: "state-estimation",
        title: "Sensors do not hand you the state",
        html: `
          <p class="lesson-lede">A flight controller combines incomplete, noisy measurements to estimate quantities it cannot measure directly. This is called <strong>sensor fusion</strong>.</p>
          ${equation(
            String.raw`\hat{\mathbf{x}}_k = f\!\left(\hat{\mathbf{x}}_{k-1},\,\mathbf{u}_{k-1}\right) + \text{measurement correction}`,
            `The hat in ${math(String.raw`\hat{\mathbf{x}}`, false)} means “estimated.” The function predicts forward from the previous estimate and motor command; new measurements correct the drift.`,
          )}
          ${cards([
            {
              tag: "Typical, not photo-verified",
              title: "Inertial measurement unit",
              body: "Most quadrotor flight controllers use gyroscopes and accelerometers to estimate angular motion and attitude. Treat this as a typical architecture unless Hopper hardware documentation confirms the exact device.",
            },
            {
              tag: "Possible, not photo-verified",
              title: "Pressure or magnetic sensing",
              body: "Barometers and magnetometers are common on some aircraft, but neither can be identified from these photographs. Do not list them as verified Hopper components.",
            },
            {
              tag: "Estimated quantity",
              title: "Altitude and velocity",
              body: "Altitude and velocity are usually fused estimates. A downward range measurement, visual motion, acceleration, and pressure can each contribute, depending on the hardware and firmware.",
            },
            {
              tag: "Not established",
              title: "Absolute GPS position",
              body: "No external GPS antenna is visible, and this lab is designed around indoor relative sensing. That is not the same as proving there is no internal receiver.",
            },
          ])}
          ${callout(
            "Language that stays accurate",
            "Say “the flight controller estimates attitude” rather than “the gyroscope measures attitude.” A gyroscope measures angular rate; attitude is inferred by integrating and correcting that rate.",
            "gold",
          )}
        `,
      },
      {
        id: "measurement-quality",
        title: "A useful measurement needs context",
        html: `
          <p class="lesson-lede">A number without a frame, unit, update rate, and uncertainty is not yet useful scientific information.</p>
          ${table(
            ["Question", "Why it matters", "Classroom example"],
            [
              ["What is the quantity?", "Avoids confusing a direct measurement with an estimate.", "Pixel brightness is measured; object class is inferred."],
              ["Which coordinate frame?", "A positive sign has no meaning without an axis convention.", "Image x is positive right; image y is positive up in Hopper Studio coordinates."],
              ["What are the units?", "Percent, pixels, degrees, and seconds are not interchangeable.", "Object confidence is a fraction in code but a percentage in the blocks UI."],
              ["How fresh is it?", "Some values come from a new scan; others reuse stored state.", "<code>seesObject()</code> scans now; <code>objectCoordinate()</code> reads the last stored match."],
              ["What can make it fail?", "Every sensor and algorithm has conditions where it becomes unreliable.", "Low texture, glare, motion blur, small targets, occlusion, or a blocked downward view."],
            ],
          )}
          ${check(
            "Why is “the sensor says the drone is at x = 20” incomplete?",
            "<p>Because we still need the sensor or estimator, coordinate frame, unit, sign convention, timestamp, and uncertainty. In Hopper vision, x = +20 usually means a stored image coordinate 20% of half-frame to the right—not a world position in centimeters.</p>",
          )}
        `,
      },
      {
        id: "field-check",
        title: "Run a safe bench check",
        html: `
          <ol>
            <li><strong>Remove the flight battery or keep the motors disarmed.</strong> Never reach into a powered propeller arc.</li>
            <li>Place the aircraft on a stable surface and photograph the underside at high resolution.</li>
            <li>Record only what is externally observable: lens, circuit package, window, motor, wiring, and guard.</li>
            <li>Connect the lesson camera feed and move a high-contrast card through the frame. Note orientation, latency, crop, and whether the image mirrors horizontally.</li>
            <li>Write two columns: <em>observed</em> and <em>inferred</em>. Move a claim to “verified” only when a hardware manual or source confirms it.</li>
          </ol>
          ${callout(
            "Do not cover a downward sensor in flight",
            "Blocking a stabilization or ranging sensor can cause drift or an unexpected landing response. Bench observations should be made with the aircraft safely disarmed.",
            "caution",
          )}
        `,
      },
    ],
    sources: [
      source("Supplied Hopper underside photograph", "", "IMG_4476.jpeg, 4032 × 3024"),
      source("Supplied Hopper top photograph", "", "IMG_4479.jpeg, 5712 × 4284"),
      source(
        "Adaptive Altitude and Attitude Quadrotor Controller: Theory and Experimental Evaluation",
        "",
        "Elsberry, Dawkins, and Whitcomb; supplied course paper, Section III-A",
      ),
      source(
        "Parrot Bebop 2 product paper",
        "https://www.parrot.com/assets/s3fs-public/media-public/EN_Pressrelease2015/parrotbebop2theall-in-onedrone.pdf",
        "Example of manufacturer language that distinguishes a vertical camera, ultrasound sensor, and pressure sensor",
      ),
    ],
  }),

  lesson({
    number: "02",
    slug: "02-quadrotor-aerodynamics",
    kicker: "From four rotors to six degrees of freedom",
    title: "How an X-quadrotor flies",
    summary:
      "Build an accurate mental model of thrust, torque, coordinate frames, and the X-configuration using the supplied paper’s NED/FRD convention.",
    duration: "28 min",
    level: "Math + physics",
    objectives: [
      "Distinguish the inertial NED frame from the body-fixed FRD frame.",
      "Read the paper’s pose, velocity, and motor-input vectors correctly.",
      "Explain hover, translation, and rotation using force and torque balance.",
      "Switch to an intuitive altitude-up variable without silently changing signs.",
    ],
    sections: [
      {
        id: "x-configuration",
        title: "The X is geometry, not decoration",
        html: `
          <p class="lesson-lede">In an X configuration, the forward and right body axes pass between the arms. Each rotor is offset in both body x and body y, so each can contribute to roll and pitch torque.</p>
          <figure class="lesson-figure">
            <div class="lesson-figure__frame">
              <img src="assets/images/x-quadrotor-top-generated.jpg" width="1536" height="1024" alt="Generated orthographic top view of a level X-configuration classroom quadrotor">
              <span class="rotor-marker rotor-marker--1" aria-hidden="true">1</span>
              <span class="rotor-marker rotor-marker--2" aria-hidden="true">2</span>
              <span class="rotor-marker rotor-marker--3" aria-hidden="true">3</span>
              <span class="rotor-marker rotor-marker--4" aria-hidden="true">4</span>
              <span class="quad-axis quad-axis--b1" aria-hidden="true"><span>+b₁ · forward</span></span>
              <span class="quad-axis quad-axis--b2" aria-hidden="true"><span>+b₂ · right</span></span>
            </div>
            <figcaption><strong>Paper convention over a generated classroom-aircraft rendering.</strong> Viewed from above with +b₁ toward the top of the image and +b₂ to the right, rotor 1 is front-right, 2 rear-left, 3 front-left, and 4 rear-right. This numbering explains the supplied paper’s matrices; it is <em>not</em> verified Hopper firmware motor numbering.</figcaption>
          </figure>
          ${cards([
            { tag: "Body axis", title: "b₁ points forward", body: "The front direction moves with the aircraft. When the drone yaws, b₁ rotates in the room." },
            { tag: "Body axis", title: "b₂ points right", body: "Right is defined from the aircraft’s own perspective, not the viewer’s." },
            { tag: "Body axis", title: "b₃ points down", body: "Forward-Right-Down is right-handed: b₁ × b₂ = b₃." },
            { tag: "Axis offset", title: "d is not the arm radius", body: "With dₓ = dᵧ = d, the physical center-to-rotor radius is √2d." },
          ])}
          ${callout(
            "Rotor-arrow caveat",
            "The paper’s yaw row is unambiguous, but its figure does not define whether curved arrows show propeller spin or the resulting body reaction. The lesson follows Equation (10)’s torque signs and does not reinterpret those arrows.",
            "caution",
          )}
        `,
      },
      {
        id: "frames",
        title: "NED and FRD make down positive",
        html: `
          <p class="lesson-lede">The supplied model uses a North-East-Down inertial frame and a Forward-Right-Down body frame. This convention is common in aviation, but it changes signs compared with a classroom z-up graph.</p>
          ${table(
            ["Frame", "Axes", "Moves with aircraft?", "Positive vertical"],
            [
              ["Inertial frame a", "<i>a</i>₁ north, <i>a</i>₂ east, <i>a</i>₃ down", "No", "Down"],
              ["Body frame b", "<i>b</i>₁ forward, <i>b</i>₂ right, <i>b</i>₃ down", "Yes", "Down"],
              ["Normalized Hopper Studio vision coordinates", "x right, y up after normalization; raw image pixels use x right, y down", "Camera-relative", "Not an altitude axis"],
            ],
          )}
          <p>The rotation matrix ${math(String.raw`R_{ab}(\boldsymbol{\phi})`, false)} maps a vector written in body coordinates into inertial/NED coordinates. For ZYX Euler angles, the paper defines</p>
          ${equation(
            String.raw`R_{ab}(\boldsymbol{\phi}) = R_z(\phi_3)\,R_y(\phi_2)\,R_x(\phi_1)`,
            "Equation (12). This is the standard ZYX (yaw-pitch-roll) convention. In a matrix-vector product, the rightmost roll rotation acts first, followed by pitch and yaw.",
          )}
          ${callout(
            "Sign trap",
            `At zero yaw, small roll/pitch, and near hover (${math(String.raw`F_T\approx mg`, false)}), the paper’s convention gives ${math(String.raw`\ddot{x}\approx -g\phi_2`, false)} and ${math(String.raw`\ddot{y}\approx +g\phi_1`, false)}. Copying a z-up formula without changing signs produces the wrong acceleration direction.`,
            "caution",
          )}
        `,
      },
      {
        id: "state",
        title: "Twelve numbers describe rigid-body motion",
        html: `
          <p class="lesson-lede">The paper groups configuration into a six-entry pose vector and velocity into a second six-entry vector.</p>
          ${equation(
            String.raw`\boldsymbol{\eta} =
              \begin{bmatrix}\boldsymbol{\xi}_a\\\boldsymbol{\phi}\end{bmatrix}
              =
              \begin{bmatrix}x&y&z&\phi_1&\phi_2&\phi_3\end{bmatrix}^{\!\top}`,
            "Equation (5): inertial position plus roll, pitch, and yaw.",
          )}
          ${equation(
            String.raw`\boldsymbol{\nu} =
              \begin{bmatrix}\mathbf{v}_a\\\boldsymbol{\omega}_b\end{bmatrix}
              =
              \begin{bmatrix}v_x&v_y&v_z&p&q&r\end{bmatrix}^{\!\top}`,
            "Equation (6): inertial linear velocity plus body angular velocity.",
          )}
          <p>The complete first-order dynamic state therefore has twelve scalars, ${math(String.raw`[\boldsymbol{\eta}^{\top}\;\boldsymbol{\nu}^{\top}]^{\top}`, false)}. The body rates ${math(String.raw`p,q,r`, false)} are not generally identical to roll, pitch, and yaw derivatives.</p>
          ${equation(
            String.raw`\dot{\boldsymbol{\xi}}_a=\mathbf{v}_a,\qquad
              \dot{\boldsymbol{\phi}}=J(\boldsymbol{\phi})\,\boldsymbol{\omega}_b`,
            "Equations (1) and (2). The Euler-rate Jacobian J maps body angular rate into angle rate.",
          )}
          <details class="lesson-check">
            <summary>Engineering detail · the full ZYX Euler-rate Jacobian</summary>
            <div class="lesson-check__answer">
              ${equation(
                String.raw`J(\boldsymbol{\phi}) =
                  \begin{bmatrix}
                  1 & \sin\phi_1\tan\phi_2 & \cos\phi_1\tan\phi_2\\
                  0 & \cos\phi_1 & -\sin\phi_1\\
                  0 & \sin\phi_1/\cos\phi_2 & \cos\phi_1/\cos\phi_2
                  \end{bmatrix}`,
                "Equation (11). This Euler-angle representation is singular when pitch reaches ±90°.",
                true,
              )}
            </div>
          </details>
        `,
      },
      {
        id: "forces",
        title: "Gravity and rotated thrust set translation",
        html: `
          <p class="lesson-lede">Each rotor accelerates air approximately along body +b₃, so reaction thrust on the aircraft acts along −b₃. At level attitude these directions coincide with inertial down and up, respectively.</p>
          ${equation(
            String.raw`M\dot{\mathbf{v}}_a = \mathbf{a}_3mg + R_{ab}(\boldsymbol{\phi})\,T_{\Sigma}\mathbf{u}`,
            "Equation (3): inertial gravity plus body thrust rotated into the inertial frame.",
          )}
          ${equation(
            String.raw`\mathbf{u} =
              \begin{bmatrix}
              \omega_1|\omega_1|&\omega_2|\omega_2|&
              \omega_3|\omega_3|&\omega_4|\omega_4|
              \end{bmatrix}^{\!\top}`,
            "Equation (7). For fixed-direction, nonnegative rotor-speed magnitudes, each entry reduces to ωᵢ².",
          )}
          <p>At level hover, the vertical forces balance:</p>
          ${equation(
            String.raw`\sum_{i=1}^{4} c_{ti}\,\omega_i^2 = mg`,
            "Hover is balance, not zero thrust. If total lift is smaller than weight, the NED z acceleration is positive—downward.",
          )}
          <p>Tilt redirects part of the thrust horizontally. If we introduce an intuitive altitude-up variable ${math(String.raw`h=-z`, false)} and a positive total lift magnitude ${math(String.raw`F_T`, false)}, then</p>
          ${equation(
            String.raw`m\ddot{h}=F_T\cos\phi_1\cos\phi_2-mg`,
            "This is the altitude-up form. It is equivalent to the paper’s NED equation after defining h = −z; it is not the paper’s z equation.",
          )}
          ${callout(
            "Why tilted hover needs more thrust",
            `The vertical part is ${math(String.raw`F_T\cos\phi_1\cos\phi_2`, false)}. As ${math(String.raw`|\phi_1|`, false)} or ${math(String.raw`|\phi_2|`, false)} grows away from zero within the normal ${math(String.raw`|\phi|<90^\circ`, false)} flight range, the cosine product shrinks, so total lift must increase to keep the same altitude.`,
            "gold",
          )}
        `,
      },
      {
        id: "torques",
        title: "Unequal rotors create torque",
        html: `
          <p class="lesson-lede">Translation depends on the sum of thrusts. Rotation depends on how those thrusts and drag torques are distributed around the center of mass.</p>
          ${equation(
            String.raw`I_m\dot{\boldsymbol{\omega}}_b =
              -\boldsymbol{\omega}_b\times(I_m\boldsymbol{\omega}_b)+T\mathbf{u}`,
            "Equation (4): rigid-body gyroscopic coupling plus motor-generated torque.",
          )}
          ${table(
            ["Desired motion", "Mixer idea", "What stays roughly constant"],
            [
              ["Climb / descend", "For a symmetric aircraft with matched coefficients, raise or lower all four together.", "A real mixer compensates for unequal motors so roll, pitch, and yaw torque stay near zero."],
              ["Roll", "Increase one side’s moment and decrease the other side’s.", "Total thrust can be held near hover."],
              ["Pitch", "Shift thrust between front and rear moment arms.", "Total thrust can be held near hover."],
              ["Yaw", "Change the balance between the paper’s positive- and negative-yaw rotor pairs.", "Net lift can remain nearly constant."],
            ],
          )}
          <details class="lesson-check">
            <summary>Engineering detail · the paper’s X-configuration allocation matrices</summary>
            <div class="lesson-check__answer">
              ${equation(
                String.raw`T_{\Sigma} = -
                  \begin{bmatrix}
                  0&0&0&0\\
                  0&0&0&0\\
                  c_{t1}&c_{t2}&c_{t3}&c_{t4}
                  \end{bmatrix}`,
                "Equation (9): every rotor thrust points along −b₃.",
                true,
              )}
              ${equation(
                String.raw`T =
                  \begin{bmatrix}
                  -d_yc_{t1}& d_yc_{t2}& d_yc_{t3}&-d_yc_{t4}\\
                   d_xc_{t1}&-d_xc_{t2}& d_xc_{t3}&-d_xc_{t4}\\
                   c_{d1}&c_{d2}&-c_{d3}&-c_{d4}
                  \end{bmatrix}`,
                "Equation (10): roll, pitch, and yaw torque rows for the paper’s rotor numbering.",
                true,
              )}
            </div>
          </details>
        `,
      },
      {
        id: "commands-versus-physics",
        title: "A percent command is not a force",
        html: `
          <p class="lesson-lede">Hopper Studio exposes classroom commands such as 15% forward power. The paper uses rotor channels ${math(String.raw`\omega_i|\omega_i|`, false)}, which reduce to ${math(String.raw`\omega_i^2`, false)} for fixed-direction, nonnegative speed magnitudes. A flight controller and motor mixer sit between those descriptions.</p>
          <ol>
            <li>Your program requests a direction, duration, or signed axis percentage.</li>
            <li>The onboard controller interprets that request as desired attitude/rate behavior.</li>
            <li>A mixer distributes the request across four motors.</li>
            <li>Motor speed, battery voltage, propeller aerodynamics, mass, and disturbances determine the actual force.</li>
          </ol>
          ${callout(
            "Model responsibly",
            `Do not substitute a Studio power percentage directly for ${math(String.raw`\omega_i|\omega_i|`, false)} (or ${math(String.raw`\omega_i^2`, false)} in the nonnegative-speed simplification), newtons, or RPM. It is a normalized control command, and its physical meaning depends on the controller and vehicle.`,
            "caution",
          )}
          ${check(
            "If the aircraft pitches nose-down in the paper’s FRD convention, what sign is φ₂?",
            `<p>Nose-down pitch is ${math(String.raw`\phi_2<0`, false)}. At zero yaw, small angle, and near hover, ${math(String.raw`\ddot{x}\approx-g\phi_2`, false)}, so the forward x acceleration is positive.</p>`,
          )}
        `,
      },
    ],
    sources: [
      source(
        "Adaptive Altitude and Attitude Quadrotor Controller: Theory and Experimental Evaluation",
        "",
        "Elsberry, Dawkins, and Whitcomb; supplied course paper, Equations (1)–(13) and Figure 1",
      ),
      source(
        "Small Unmanned Aircraft: Theory and Practice",
        "https://press.princeton.edu/books/hardcover/9780691149219/small-unmanned-aircraft",
        "Beard and McLain; standard aerospace reference for rigid-body frames and dynamics",
      ),
    ],
  }),

  lesson({
    number: "03",
    slug: "03-coding-blocks-reference",
    kicker: "Build a program you can explain",
    title: "Coding blocks field guide",
    summary:
      "A complete, student-facing map of every Hopper block category, including defaults, units, fresh-scan behavior, and safety consequences.",
    duration: "22 min",
    level: "Blocks",
    objectives: [
      "Build a program from events, commands, values, and control-flow blocks.",
      "Choose a fresh vision scan when a decision depends on the current frame.",
      "Recognize persistent motion commands and reset them deliberately.",
      "End every flight path with a safe landing strategy.",
    ],
    sections: [
      {
        id: "grammar",
        title: "Shape is grammar",
        html: `
          <p class="lesson-lede">Blockly prevents many syntax errors by making only compatible shapes connect. That does not guarantee a sensible or safe program.</p>
          ${cards([
            { tag: "Hat block", title: "Event or program start", body: "Starts a stack when Run is pressed, a key changes, or a drone event occurs." },
            { tag: "Statement block", title: "Do something", body: "Commands such as take off, wait, scan, fly, print, and land connect vertically." },
            { tag: "Value block", title: "Produce data", body: "Rounded blocks produce numbers, text, or booleans that fit into inputs." },
            { tag: "Container", title: "Control flow", body: "If, loop, and function blocks contain statements and decide when they run." },
          ])}
          ${callout(
            "Execution model",
            "A normal non-event program automatically requests landing when it reaches the end. Event-driven programs remain alive until stopped. The Stop button force-lands; the “stop program” block only stops/reset motion and does not itself land.",
            "caution",
          )}
        `,
      },
      {
        id: "start-events",
        title: "Start, events, and general blocks",
        html: `
          ${table(
            ["Block", "Inputs / choices", "Behavior"],
            [
              ["when program starts", "Statement stack", "Runs once when the green Run button starts the program."],
              ["stop program", "None", "Stops execution and resets motion. It does not send a landing command."],
              ["when key is pressed / released", "Arrow keys, Space, or a–z", "Registers an event handler. Repeated key events can overlap."],
              ["key is pressed", "Same key list", "Boolean value for polling inside a loop or decision."],
              ["wait", "Seconds; default shadow 1", "Pauses sequentially and can be cancelled by Stop."],
              ["print", "Any value", "Adds a line to the Hopper Studio console."],
              ["continue if", "Boolean", "Stops the current program or event handler unless the condition is true."],
            ],
          )}
        `,
      },
      {
        id: "flight-blocks",
        title: "Mini Drone blocks",
        html: `
          <h3>Flight</h3>
          ${table(
            ["Block", "Inputs / choices", "Important behavior"],
            [
              ["take off", "None", "Checks the real drone’s reported battery and waits for takeoff stabilization."],
              ["land", "None", "Zeros motion, sends land, and waits for the landing interval."],
              ["hover", "None", "Zeros all axes and waits 1 second."],
              ["fly", "Direction; 1 s; 15% power", "Directions: forward, backward, left, right, up, down. Block power is a positive percentage."],
              ["center on AprilTag", "ID; 10% power; optional tolerances", "Pulses roll/pitch, rescans, then corrects image-plane yaw. It does not control height or distance."],
              ["rotate", "Degrees; clockwise/counterclockwise; default 90°", "Uses a nominal 180°/s yaw command, then settles."],
              ["flip", "Forward/backward/left/right", "Runs the accessory maneuver and waits 2.5 seconds. Use only with clearance."],
              ["set pitch/roll/yaw/altitude", "Signed −100…100%", "Persists until reset or another command. “Altitude” maps to the gaz/throttle-like axis."],
              ["reset movement", "None", "Zeros axes; does not land."],
              ["cut off motors", "None", "Emergency only. Immediately stops motors; no controlled descent."],
            ],
          )}
          <h3>Sensors, events, and accessories</h3>
          ${table(
            ["Block", "Output / choices", "Important behavior"],
            [
              ["battery level", "Number", "Reported percent when telemetry exists; otherwise no value/null in code."],
              ["drone is flying / landed", "Boolean", "Reads the controller’s current state."],
              ["wait until battery changes", "Statement", "Can wait indefinitely if no new telemetry arrives."],
              ["when drone …", "Flying, landed, crashed, battery changed", "Registers an event handler."],
              ["take and store photo", "Statement", "Captures the current Studio camera/simulator frame into the session gallery."],
              ["open / close grabber", "Statement", "Requires the physical claw accessory."],
              ["fire cannon", "Statement", "Requires the physical cannon accessory."],
            ],
          )}
        `,
      },
      {
        id: "vision-blocks",
        title: "Camera Vision blocks",
        html: `
          ${table(
            ["Block", "Inputs / defaults", "Fresh scan?"],
            [
              ["camera sees binary", "White/black; threshold 60%; invert; coverage 10%", "Yes. Returns a boolean after measuring full-frame coverage."],
              ["binary center pixel", "White/black; threshold 60%; invert", "Yes. Checks only the center reticle pixel."],
              ["scan for objects", "Model confidence comes from the Vision panel", "Yes. Saves up to 10 real detections."],
              ["camera sees object", "Exact COCO label; confidence 55%", "Yes. Confidence is entered as a percentage in blocks."],
              ["x/y coordinate of object", "Label; confidence 55%", "No. Reads the last stored matching coordinate; right/up are positive."],
              ["custom model sees", "Exact label; confidence 75%", "Yes. Requires the three Teachable Machine files to be loaded."],
              ["scan for AprilTags", "None", "Yes. Saves tag36h11 detections."],
              ["camera sees AprilTag", "any or ID 0–586", "Yes. Uses a new camera frame."],
            ],
          )}
          ${callout(
            "Percent versus fraction",
            "Blocks and sliders display confidence as 55%. JavaScript and Python use 0.55. Mixing these scales is a common reason a detector appears to find nothing.",
            "gold",
          )}
        `,
      },
      {
        id: "logic-loops",
        title: "Logic, loops, math, variables, and functions",
        html: `
          ${cards([
            { tag: "Logic", title: "Decide", body: "If/else, comparison, and/or, not, booleans, and ternary choice blocks combine facts into decisions." },
            { tag: "Loops", title: "Repeat with an exit", body: "Forever, for-seconds, repeat-count, while/until, counted-for, break, and continue blocks control repetition." },
            { tag: "Math", title: "Transform numbers", body: "Arithmetic, roots/functions, trigonometry, rounding, modulo, and random-number blocks support calculations." },
            { tag: "Variables", title: "Remember", body: "Store thresholds, counters, scan results, and state. Name variables by meaning and unit." },
            { tag: "Functions", title: "Reuse", body: "Group a sequence into a named procedure. Keep flight functions short and make their preconditions clear." },
          ])}
          <p>A forever loop that contains no wait or awaited command can monopolize the browser. Include a timed command, wait, or a clear stop condition.</p>
          ${codeBlock("javascript", "What a safe block mission should generate", [
            "await drone.takeOff();",
            "try {",
            "  const found = await vision.seesObject(\"bottle\", 0.55);",
            "  if (found) {",
            "    await drone.fly(\"forward\", 1, 15);",
            "  } else {",
            "    console.log(\"Bottle not found; holding position.\");",
            "    await drone.hover();",
            "  }",
            "} finally {",
            "  await drone.land();",
            "}",
          ].join("\n"))}
          ${check(
            "Which block should follow a persistent “set roll to 10%” command?",
            "<p>Use <strong>reset movement</strong> after the intended interval, or use a timed <strong>fly</strong> block instead. A persistent axis command continues until another command changes it.</p>",
          )}
        `,
      },
    ],
    sources: [
      source("Hopper Studio Blockly definitions", "", "Verified against lib/blockly.ts and lib/runtime.ts in the course build"),
      source(
        "Blockly documentation",
        "https://developers.google.com/blockly/guides/overview",
        "Google’s official overview of blocks, workspaces, and code generation",
      ),
    ],
  }),

  lesson({
    number: "04",
    slug: "04-javascript-api-reference",
    kicker: "Exact signatures, honest side effects",
    title: "JavaScript API reference",
    summary:
      "Every supported student-facing JavaScript command, with argument units, defaults, return values, scan freshness, and flight-safety behavior.",
    duration: "35 min",
    level: "JavaScript",
    objectives: [
      "Use await on every command that returns a Promise.",
      "Choose correct units and allowed string arguments.",
      "Distinguish commands that move, scan, read stored state, or stop execution.",
      "Write a flight program that lands even when a scan or accessory command fails.",
    ],
    sections: [
      {
        id: "execution",
        title: "Four objects form the classroom API",
        html: `
          <p class="lesson-lede">Hopper Studio executes student code as an async function with four injected objects: <code>drone</code>, <code>vision</code>, <code>runtime</code>, and <code>console</code>.</p>
          ${codeBlock("javascript", "Minimal safe structure", [
            "await drone.takeOff();",
            "",
            "try {",
            "  await drone.fly(\"forward\", 1, 15);",
            "  const result = await vision.scanThreshold(60, false);",
            "  console.log(`White coverage: ${result.whiteCoverage.toFixed(1)}%`);",
            "} finally {",
            "  await drone.land();",
            "}",
          ].join("\n"))}
          <p><code>await</code> means “pause this program here until the command finishes.” Without it, a later command can begin while a movement or scan is still active.</p>
          ${callout(
            "Landing behavior",
            "Normal non-event completion requests landing automatically, and errors force-land. Still write an explicit finally/land block: it documents intent and makes copied code safer outside the runner.",
            "gold",
          )}
        `,
      },
      {
        id: "drone-api",
        title: "drone · flight, state, and accessories",
        html: `
          ${apiList([
            { signature: "await drone.takeOff()", label: "Promise<void>", detail: "Takes off and waits about 3 seconds. The real controller refuses takeoff when reported battery is 10% or lower." },
            { signature: "await drone.land()", label: "Promise<void>", detail: "Zeros movement, sends the land command, and waits about 5 seconds." },
            { signature: "await drone.hover()", label: "Promise<void>", detail: "Zeros all motion axes, then waits 1 second." },
            { signature: "await drone.wait(seconds)", label: "Promise<void>", detail: "Waits a nonnegative duration. Invalid or negative values become 0; Stop cancels the wait." },
            { signature: "await drone.fly(direction, seconds = 0, power = 0)", label: "Promise<void>", detail: "Direction: up, down, left, right, forward, or backward. Seconds are nonnegative. Power clamps to −100…100; normally use 0…100 because a negative number reverses the named direction. Includes a 2-second settle." },
            { signature: "await drone.rotate(degrees = 0, direction = \"clockwise\")", label: "Promise<void>", detail: "Degrees are nonnegative. Direction is clockwise or counterclockwise. Uses a nominal 180°/s command and then settles." },
            { signature: "await drone.flip(direction)", label: "Promise<void>", detail: "Direction: forward, backward, left, or right. Resets motion and waits about 2.5 seconds. Use only with instructor-approved clearance." },
            { signature: "drone.setAxis(axis, power)", label: "void", detail: "Axis: pitch, roll, yaw, gaz, or altitude (alias of gaz). Signed power clamps to −100…100 and persists until reset or replaced." },
            { signature: "drone.reset()", label: "void", detail: "Zeros all movement axes. It does not land." },
            { signature: "drone.getBatteryLevel()", label: "number | null", detail: "Returns reported battery percent or null before telemetry exists." },
            { signature: "drone.isFlying() / drone.isLanded()", label: "boolean", detail: "Reads the current controller state." },
            { signature: "await drone.waitUntilBatteryLevelChanges()", label: "Promise<void>", detail: "Waits for new battery telemetry or cancellation. It can otherwise wait indefinitely." },
            { signature: "await drone.takePicture()", label: "Promise<void>", detail: "Captures the current Studio camera/simulator view as a JPEG up to 960 px wide and adds it to the session gallery." },
            { signature: "await drone.grabber(\"OPEN\" | \"CLOSE\")", label: "Promise<void>", detail: "Requires the claw accessory and waits about 2 seconds." },
            { signature: "await drone.fireGun()", label: "Promise<void>", detail: "Requires the cannon accessory and waits about 3 seconds." },
            { signature: "await drone.cutoff()", label: "Promise<void>", detail: "Emergency motor cutoff. No controlled descent; never use as a normal stop." },
            { signature: "await drone.manualNudge(direction, power = 30, seconds = 0.45)", label: "Promise<void> · advanced", detail: "Horizontal direction only. Absolute power clamps to 1…100 and time to 0.15…1.5 seconds. Ignored unless flying; normally reserved for the Studio manual-control pad." },
          ])}
          ${callout(
            "App-owned controller methods",
            "Do not call startRun, stopRun, abortRun, landNoWait, forceLand, disconnect, or telemetry callback fields from student code. The Studio owns connection and emergency behavior.",
            "caution",
          )}
        `,
      },
      {
        id: "vision-api",
        title: "vision · pixels, detectors, and stored coordinates",
        html: `
          ${apiList([
            { signature: "await vision.scanThreshold(threshold = 60, invert = false, announceScan = true)", label: "ThresholdResult", detail: "Fresh scan at up to 320 px wide. Threshold clamps to 0…100. Result fields: threshold, invert, whiteCoverage, blackCoverage, centerWhite, frameWidth, frameHeight, binaryData. Set announceScan false only to suppress the Studio scan animation/event." },
            { signature: "await vision.seesBinary(color, threshold = 60, invert = false, minimumCoverage = 10)", label: "boolean", detail: "Fresh scan. Color is white or black. Coverage clamps to 0…100%." },
            { signature: "await vision.binaryCenter(color, threshold = 60, invert = false)", label: "boolean", detail: "Fresh scan; tests only the center reticle pixel." },
            { signature: "await vision.loadObjectModel()", label: "ObjectDetection", detail: "Loads the local COCO-SSD model once. Requires a local/hosted server; direct file:// loading is unsupported." },
            { signature: "await vision.detectObjects(minimumConfidence = 0.55, announceScan = true)", label: "VisionDetection[]", detail: "Fresh scan. Confidence is 0…1. Real inference returns at most 10 boxes with bbox, class, score, frame size, centerX, and centerY. Set announceScan false only to suppress the Studio scan animation/event." },
            { signature: "await vision.seesObject(label, minimumConfidence = 0.55)", label: "boolean", detail: "Fresh scan and case-insensitive exact COCO class match." },
            { signature: "vision.objectCoordinate(label, axis, minimumConfidence = 0.55)", label: "number", detail: "No fresh scan. Reads the last stored coordinate for x or y, from −100 to +100; right/up are positive. Returns 0 before a match or when stored confidence is too low." },
            { signature: "await vision.scanAprilTags(announceScan = true)", label: "AprilTagDetection[]", detail: "Fresh tag36h11 scan at up to 520 px wide. Set announceScan false only to suppress the Studio scan animation/event." },
            { signature: "await vision.seesAprilTag(id = \"any\")", label: "boolean", detail: "Fresh scan. ID is any or a number from 0 through 586." },
            { signature: "await vision.centerOnAprilTag(drone, id = \"any\", translationPower = 10, centerSlack = 5, angleSlack = 5, lostTagSearches = 3)", label: "boolean", detail: "Pulses roll/pitch and image-plane yaw for up to 30 seconds. Returns true only when position and angle tolerances are met. No altitude, distance, or collision control." },
            { signature: "await vision.loadCustomModel(modelFile, weightsFile, metadataFile)", label: "Promise<string[]> · advanced", detail: "Loads the three Teachable Machine File objects and returns their metadata labels. The Vision Testing file picker normally owns this step." },
            { signature: "await vision.classifyCustomModel(announceScan = true)", label: "CustomPrediction[]", detail: "Fresh whole-frame Teachable Machine classification. Requires model.json, weights.bin, and metadata.json loaded in Vision Testing. Set announceScan false only to suppress the Studio scan animation/event." },
            { signature: "await vision.seesCustomLabel(label, minimumConfidence = 0.75)", label: "boolean", detail: "Fresh classification and case-insensitive exact label match." },
            { signature: "await vision.capturePhoto(maxWidth = 960)", label: "Promise<{ blob, width, height }> · advanced", detail: "Captures the current source as a JPEG-backed photo record. The injected drone.takePicture() wrapper is the normal student command because it also stores the result in the gallery." },
          ])}
          <p>Object coordinates are normalized around the image center:</p>
          ${equation(
            String.raw`x_n = 200\left(\frac{x_c}{W}-\frac{1}{2}\right),\qquad
              y_n = -200\left(\frac{y_c}{H}-\frac{1}{2}\right)`,
            "The detection-box center (x_c, y_c) becomes −100…+100. The minus sign makes up positive even though pixel rows increase downward.",
          )}
          ${callout(
            "Stored means stale is possible",
            "objectCoordinate() remembers a prior match. A later missed scan does not erase that coordinate. Call seesObject() or detectObjects() when a decision requires current visibility.",
            "caution",
          )}
        `,
      },
      {
        id: "runtime-api",
        title: "runtime and console · events and program life",
        html: `
          ${apiList([
            { signature: "runtime.registerKey(kind, key, asyncHandler)", label: "void", detail: "Kind is pressed or released. Keys include lowercase letters, ArrowUp/Down/Left/Right, and Space. Repeated handlers can overlap." },
            { signature: "runtime.registerDrone(eventName, asyncHandler)", label: "void", detail: "Event names: flying, landed, crashed, batteryLevelChanged." },
            { signature: "runtime.keyIsPressed(key)", label: "boolean", detail: "Polls the current normalized keyboard state." },
            { signature: "await runtime.repeatForSeconds(seconds, asyncHandler)", label: "Promise<void>", detail: "Runs the handler sequentially until the nonnegative duration expires or the program stops." },
            { signature: "await runtime.tick()", label: "Promise<void>", detail: "Yields to the browser and throws Program stopped after cancellation." },
            { signature: "runtime.stop()", label: "void", detail: "Stops execution, removes event listeners, and resets/aborts motion. It does not send a land command." },
            { signature: "runtime.stopped / runtime.hasEvents", label: "boolean", detail: "Read-only program-state flags for loops or diagnostics." },
            { signature: "console.log(...values)", label: "void", detail: "Writes an informational line to the Studio console." },
            { signature: "console.warn(...values) / console.error(...values)", label: "void", detail: "Writes warning or error lines to the Studio console." },
          ])}
          ${codeBlock("javascript", "Keyboard event with explicit landing", [
            "runtime.registerKey(\"pressed\", \"Space\", async () => {",
            "  if (!drone.isFlying()) {",
            "    await drone.takeOff();",
            "    console.log(\"Airborne\");",
            "  } else {",
            "    await drone.land();",
            "    console.log(\"Landed\");",
            "  }",
            "});",
          ].join("\n"))}
        `,
      },
      {
        id: "argument-patterns",
        title: "Arguments are a contract",
        html: `
          ${table(
            ["Kind", "JavaScript form", "Examples"],
            [
              ["String choice", "Quoted exact word", "<code>\"forward\"</code>, <code>\"clockwise\"</code>, <code>\"white\"</code>"],
              ["Duration", "Seconds as a number", "<code>0.5</code>, <code>2</code>"],
              ["Power", "Percent, usually 0…100", "<code>15</code>; signed only for setAxis"],
              ["Confidence", "Fraction from 0…1", "<code>0.55</code> means 55%"],
              ["Threshold / coverage", "Percent from 0…100", "<code>60</code>, <code>10</code>"],
              ["Boolean", "Unquoted literal", "<code>true</code>, <code>false</code>"],
            ],
          )}
          ${codeBlock("javascript", "Object-centering decision loop", [
            "await drone.takeOff();",
            "try {",
            "  for (let attempt = 0; attempt < 4; attempt += 1) {",
            "    const visible = await vision.seesObject(\"bottle\", 0.55);",
            "    if (!visible) {",
            "      console.warn(\"Bottle lost; holding.\");",
            "      await drone.hover();",
            "      continue;",
            "    }",
            "",
            "    const x = vision.objectCoordinate(\"bottle\", \"x\", 0.55);",
            "    if (Math.abs(x) <= 8) break;",
            "    drone.setAxis(\"roll\", x > 0 ? 10 : -10);",
            "    await drone.wait(0.25);",
            "    drone.reset();",
            "    await drone.wait(0.6);",
            "  }",
            "} finally {",
            "  drone.reset();",
            "  await drone.land();",
            "}",
          ].join("\n"))}
        `,
      },
    ],
    sources: [
      source("Hopper Studio JavaScript command surface", "", "Verified against lib/drone.ts, lib/vision.ts, lib/runtime.ts, and components/HopperStudio.tsx"),
      source(
        "MDN async function and await",
        "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/async_function",
        "JavaScript language reference",
      ),
    ],
  }),

  lesson({
    number: "05",
    slug: "05-thresholding-with-hopper",
    kicker: "Turn light into a measurable decision",
    title: "Binary vision and thresholding",
    summary:
      "Understand the exact brightness equation, calibrate a threshold from evidence, and build decisions that survive shadows, glare, and noise.",
    duration: "24 min",
    level: "Vision foundations",
    objectives: [
      "Compute luminance from RGB pixels and map a percentage threshold to 0…255.",
      "Distinguish whole-frame coverage from a center-pixel test.",
      "Calibrate with representative light and background conditions.",
      "Use repeated evidence or hysteresis instead of one brittle frame.",
    ],
    sections: [
      {
        id: "one-pixel",
        title: "Every pixel becomes one bit",
        html: `
          <p class="lesson-lede">Thresholding compresses a color image into a binary image. The result is easy to reason about because every pixel is either white or black.</p>
          ${equation(
            String.raw`Y = 0.2126R + 0.7152G + 0.0722B`,
            "Hopper Studio’s luminance calculation. Green contributes most because human visual sensitivity is strongest there.",
          )}
          ${equation(
            String.raw`B(x,y) =
              \begin{cases}
              1,&Y(x,y)\ge 2.55\,\tau\\
              0,&Y(x,y)<2.55\,\tau
              \end{cases}`,
            "τ is the displayed threshold percentage from 0 to 100. Multiplying by 2.55 converts it to an 8-bit cutoff from 0 to 255.",
          )}
          <p>When <code>invert</code> is true, Hopper Studio swaps the white/black assignment after the comparison. It does not change the underlying brightness.</p>
          ${callout(
            "Threshold is not confidence",
            "A threshold of 60% is a pixel-brightness cutoff. It is unrelated to the 55% confidence used by object detection.",
            "gold",
          )}
        `,
      },
      {
        id: "coverage-center",
        title: "Coverage asks a different question than center",
        html: `
          ${equation(
            String.raw`\text{white coverage} =
              100\,\frac{\#\{(x,y):B(x,y)=1\}}{W\,H}`,
            "Full-frame coverage is the percentage of pixels classified as white.",
          )}
          ${cards([
            { tag: "Whole frame", title: "seesBinary", body: "Useful for large regions: a white landing sheet, dark doorway, or broad lighting change. It compares coverage with a minimum percentage." },
            { tag: "Single reticle", title: "binaryCenter", body: "Useful for alignment. It checks the one pixel at the image center, so it is sensitive to noise and tiny shifts." },
          ])}
          <p>A center test can be true while total coverage is nearly zero. Conversely, a bright wall can dominate coverage even while the center points at a dark target.</p>
          ${check(
            "A white card covers 8% of the frame and the center reticle is on it. What can each test report?",
            "<p><code>binaryCenter(\"white\", 60)</code> can be true. <code>seesBinary(\"white\", 60, false, 10)</code> is false because 8% is below the 10% coverage requirement.</p>",
          )}
        `,
      },
      {
        id: "calibration",
        title: "Calibrate from two distributions",
        html: `
          <ol>
            <li>Connect the real camera in the room and lighting you will actually use.</li>
            <li>Collect brightness observations for the target and the background—not just one ideal frame.</li>
            <li>Choose a cutoff in the gap between the two distributions. If they overlap heavily, thresholding alone is the wrong tool.</li>
            <li>Test shadows, glare, oblique views, motion blur, and different distances.</li>
            <li>Choose a coverage threshold based on expected target size, then write it down with its unit.</li>
          </ol>
          ${table(
            ["Symptom", "Likely cause", "Better response"],
            [
              ["Everything is white", "Cutoff too low or strong glare", "Raise brightness threshold; diffuse the light."],
              ["Everything is black", "Cutoff too high or room too dark", "Lower threshold; improve illumination."],
              ["Flickers between states", "Noise near the cutoff", "Require repeated hits or add hysteresis."],
              ["Works only at one distance", "Coverage changes with apparent area", "Calibrate size range or use center/alignment plus area."],
              ["White and gray overlap", "Brightness is not distinctive enough", "Use color features, AprilTags, or a learned model."],
            ],
          )}
        `,
      },
      {
        id: "code",
        title: "Document every threshold argument",
        html: `
          ${codeBlock("javascript", "JavaScript · require two confirming frames", [
            "const threshold = 60;       // percent brightness cutoff",
            "const minimumCoverage = 10; // percent of the frame",
            "let confirmingFrames = 0;",
            "",
            "for (let sample = 0; sample < 3; sample += 1) {",
            "  const seesSheet = await vision.seesBinary(",
            "    \"white\",",
            "    threshold,",
            "    false,",
            "    minimumCoverage,",
            "  );",
            "  if (seesSheet) confirmingFrames += 1;",
            "  await drone.wait(0.15);",
            "}",
            "",
            "console.log(`Confirming frames: ${confirmingFrames}/3`);",
          ].join("\n"))}
          ${codeBlock("python", "Python · center and coverage are separate tests", [
            "threshold = 60",
            "coverage = 10",
            "",
            "enough_white = sees_binary(\"white\", threshold=threshold, invert=False, coverage=coverage)",
            "center_is_white = binary_center(\"white\", threshold=threshold, invert=False)",
            "",
            "print(\"area:\", enough_white, \"center:\", center_is_white)",
          ].join("\n"))}
          ${apiList([
            { signature: "scanThreshold(threshold = 60, invert = false)", label: "Measure", detail: "Returns both coverages, centerWhite, frame size, and binary pixel data." },
            { signature: "seesBinary(color, threshold = 60, invert = false, minimumCoverage = 10)", label: "Decide", detail: "Fresh scan and a whole-frame percentage comparison." },
            { signature: "binaryCenter(color, threshold = 60, invert = false)", label: "Align", detail: "Fresh scan and a single center-pixel comparison." },
          ])}
        `,
      },
      {
        id: "limits",
        title: "Know when binary vision is enough",
        html: `
          ${cards([
            { tag: "Good fit", title: "Controlled contrast", body: "A white card on a dark floor under stable indoor light is fast, explainable, and computationally cheap." },
            { tag: "Weak fit", title: "Semantic identity", body: "Thresholding cannot tell a white mug from white paper. It measures brightness, not object category." },
            { tag: "Weak fit", title: "Changing illumination", body: "Sunlight, automatic exposure, and shadows move the brightness distributions." },
            { tag: "Alternative", title: "Fiducial or learned vision", body: "Use AprilTags for an engineered marker, COCO-SSD for known categories, or Teachable Machine for a custom whole-frame class." },
          ])}
          ${callout(
            "Flight decision rule",
            "Never make a high-consequence maneuver from one center pixel. Combine area, repeated frames, timeouts, and a safe fallback such as hover or land.",
            "caution",
          )}
        `,
      },
    ],
    sources: [
      source("Hopper Studio threshold implementation", "", "Verified against lib/vision.ts"),
      source(
        "OpenCV thresholding tutorial",
        "https://docs.opencv.org/4.x/d7/d4d/tutorial_py_thresholding.html",
        "Official OpenCV documentation on global and adaptive thresholding",
      ),
      source(
        "IEC sRGB luminance coefficients",
        "https://www.w3.org/WAI/GL/wiki/Relative_luminance",
        "W3C explanation of the 0.2126, 0.7152, and 0.0722 coefficients",
      ),
    ],
  }),

  lesson({
    number: "06",
    slug: "06-object-detection-and-coco",
    kicker: "Pixels → features → 1,917 candidate boxes",
    title: "Object detection and Hopper’s default neural network",
    summary:
      "Name the exact detector, trace its real tensor shapes, understand what its 4.5 million coefficients do, and use confidence without pretending it is certainty.",
    duration: "32 min",
    level: "Neural networks",
    objectives: [
      "Name Hopper Studio’s exact built-in object detector and where it runs.",
      "Trace image pixels through MobileNetV2 features, SSDLite heads, anchors, and suppression.",
      "State the exact input, output, class, anchor, and stored-coefficient counts.",
      "Use fresh scans, confidence thresholds, and coordinates responsibly.",
    ],
    sections: [
      {
        id: "identity",
        title: "The default network has a precise name",
        html: `
          <p class="lesson-lede"><strong>Hopper Studio uses TensorFlow.js COCO-SSD 2.2.3 with the <code>lite_mobilenet_v2</code> base.</strong> Architecturally, it is an SSDLite-style object detector with a MobileNetV2 feature extractor.</p>
          ${cards([
            { tag: "Runs where?", title: "On the host", body: "The frozen GraphModel runs in the browser or desktop app. Camera pixels travel to the host; inference is not performed by the drone’s flight controller." },
            { tag: "Input", title: "300 × 300 × 3", body: "Studio first captures an aspect-preserving canvas up to 420 px wide. The graph resizes internally to 300 × 300 RGB and normalizes the pixels." },
            { tag: "Vocabulary", title: "80 named COCO classes", body: "Examples include person, bottle, chair, book, apple, stop sign, and laptop. The model cannot invent a new label at runtime." },
            { tag: "Output", title: "Boxes + labels + scores", body: "Hopper requests at most 10 real detections above the chosen minimum confidence, then stores normalized box centers." },
          ])}
          ${callout(
            "Simulator caveat",
            "The simulator supplies synthetic object detections and bypasses the neural network. A successful simulator detection validates program logic, not real-model accuracy.",
            "caution",
          )}
        `,
      },
      {
        id: "architecture",
        title: "The network is shaped like a multiscale funnel",
        html: `
          <p class="lesson-lede">A convolutional network does not connect every pixel to every output. Shared filters scan the image, creating feature maps whose activations behave like spatially organized “neurons.”</p>
          <figure class="nn-figure">
            <div class="nn-pipeline">
              <section class="nn-stage">
                <span class="nn-stage__label">Input layer</span>
                <div class="nn-pixels" aria-hidden="true">
                  ${Array.from({ length: 36 }, (_, index) => `<i style="--i:${index % 8}"></i>`).join("")}
                </div>
                <h3>300 × 300 × 3</h3>
                <p>270,000 RGB channel values after resize and normalization.</p>
              </section>
              <div class="nn-arrow" aria-hidden="true"></div>
              <section class="nn-stage">
                <span class="nn-stage__label">MobileNetV2 backbone</span>
                <div class="nn-feature-stack" aria-hidden="true">
                  ${Array.from({ length: 5 }, (_, index) => `<i style="--i:${index}"></i>`).join("")}
                </div>
                <h3>Learned feature maps</h3>
                <p>Depthwise separable convolutions turn edges and textures into progressively more abstract spatial features.</p>
              </section>
              <div class="nn-arrow" aria-hidden="true"></div>
              <section class="nn-stage">
                <span class="nn-stage__label">SSDLite heads + output</span>
                <div class="nn-output-list">
                  <span>Feature grids <b>19² → 1²</b></span>
                  <span>Candidate anchors <b>1,917</b></span>
                  <span>Box offsets each <b>4</b></span>
                  <span>Class logits each <b>91</b></span>
                  <span>Named COCO labels <b>80</b></span>
                </div>
                <p>Non-maximum suppression removes heavily overlapping lower-scoring boxes.</p>
              </section>
            </div>
            <figcaption><strong>Hopper’s default detection pipeline.</strong> Camera pixels pass through spatially shared MobileNetV2 features and six SSDLite prediction scales before overlapping boxes are filtered.</figcaption>
          </figure>
          ${table(
            ["Detector feature map", "Channels", "Anchors per cell", "Candidate boxes"],
            [
              ["19 × 19", "576", "3", "1,083"],
              ["10 × 10", "1,280", "6", "600"],
              ["5 × 5", "512", "6", "150"],
              ["3 × 3", "256", "6", "54"],
              ["2 × 2", "256", "6", "24"],
              ["1 × 1", "128", "6", "6"],
              ["Total", "—", "—", "<strong>1,917</strong>"],
            ],
          )}
          <p>Every candidate predicts four box offsets and 91 logits including background and unused COCO ID slots. The package maps 80 of those category IDs to human-readable labels.</p>
        `,
      },
      {
        id: "parameters",
        title: "How many parameters? 4,500,927 stored coefficients",
        html: `
          <p class="lesson-lede">The exact local model bundle has been counted from its manifest rather than estimated from a generic MobileNet diagram.</p>
          ${table(
            ["Quantity", "Exact count", "What it means"],
            [
              ["Feature-extractor coefficients", "2,869,184", "Stored inference values in the MobileNetV2 backbone."],
              ["Six predictor-head coefficients", "1,631,743", "Stored values that predict class logits and box offsets."],
              ["Stored inference coefficients", "<strong>4,500,927</strong>", "The defensible answer to “how many parameters?” for this frozen bundle."],
              ["Anchor coordinates", "7,668", "1,917 fixed anchors × 4 coordinates; geometry, not learned coefficients."],
              ["All serialized scalar elements", "4,508,632", "Coefficients, anchors, and small graph constants together."],
              ["Weight-shard bytes", "18,034,528", "About 17.20 MiB of 32-bit stored values."],
            ],
          )}
          ${callout(
            "Why “stored coefficients” is the careful term",
            "This is a frozen GraphModel with no trainable flag or checkpoint state in the browser. Some coefficients encode folded batch-normalization statistics. Counting “trainable parameters” as if the browser were training it would be misleading.",
            "gold",
          )}
          <p>There is no single useful neuron count. The number of activation values changes at every layer and depends on spatial resolution; the feature-map shapes above are more informative.</p>
        `,
      },
      {
        id: "boxes",
        title: "One pass predicts many overlapping hypotheses",
        html: `
          <ol>
            <li><strong>Resize and normalize.</strong> A camera frame becomes a 300 × 300 × 3 tensor.</li>
            <li><strong>Extract features.</strong> MobileNetV2 applies lightweight depthwise and pointwise convolutions.</li>
            <li><strong>Predict at six scales.</strong> Dense grids help smaller objects; coarse grids cover larger objects.</li>
            <li><strong>Decode anchors.</strong> Four offsets move and resize each default box.</li>
            <li><strong>Filter by score.</strong> The Studio default is 0.55, or 55%.</li>
            <li><strong>Suppress duplicates.</strong> Non-maximum suppression keeps stronger boxes when candidates overlap.</li>
          </ol>
          ${equation(
            String.raw`\operatorname{IoU}(A,B)=\frac{|A\cap B|}{|A\cup B|}`,
            "Intersection over Union quantifies box overlap. Higher values mean two candidate boxes cover nearly the same region.",
          )}
          <p>The installed TensorFlow.js package passes the chosen minimum score as both its score threshold and NMS overlap threshold. That implementation detail is another reason to test threshold choices empirically.</p>
        `,
      },
      {
        id: "confidence",
        title: "Confidence is a model score, not a probability of truth",
        html: `
          ${cards([
            { tag: "Raise threshold", title: "Fewer false positives", body: "You may miss small, blurred, partly hidden, or unusual objects." },
            { tag: "Lower threshold", title: "More candidates", body: "You gain sensitivity but must handle more wrong labels and unstable boxes." },
            { tag: "Change the scene", title: "Improve evidence", body: "Better light, a larger target, less clutter, and steadier framing often help more than threshold tuning." },
            { tag: "Use time", title: "Require persistence", body: "Confirm a detection across multiple fresh frames before a consequential movement." },
          ])}
          ${codeBlock("javascript", "Fresh scan before reading coordinates", [
            "const confidence = 0.55;",
            "const visible = await vision.seesObject(\"bottle\", confidence);",
            "",
            "if (visible) {",
            "  const x = vision.objectCoordinate(\"bottle\", \"x\", confidence);",
            "  const y = vision.objectCoordinate(\"bottle\", \"y\", confidence);",
            "  console.log({ x, y }); // center is 0,0; right/up are positive",
            "} else {",
            "  console.warn(\"No current bottle detection.\");",
            "}",
          ].join("\n"))}
        `,
      },
      {
        id: "limits",
        title: "Know the training vocabulary and failure modes",
        html: `
          <p>The model’s 80 named labels come from COCO. A “computer” in the simulator is labeled <code>laptop</code> because that is the COCO class. A custom flag color, naval object, or course-specific symbol is not part of this vocabulary.</p>
          ${table(
            ["Failure mode", "Why it happens", "Response"],
            [
              ["Small object", "Too few pixels survive resize.", "Move closer, enlarge the target, or use an engineered marker."],
              ["Unusual viewpoint", "Training examples may not cover it.", "Collect multiple views with a custom classifier or change framing."],
              ["Similar categories", "Features overlap between labels.", "Use context cautiously; require repeated evidence."],
              ["Occlusion", "Only part of the learned shape is visible.", "Change view or wait; do not assume the last coordinate is current."],
              ["Domain shift", "Simulator art differs from real camera imagery.", "Treat simulator success as code validation only."],
            ],
          )}
          ${check(
            "Does 0.80 confidence mean the label is correct 80% of the time?",
            "<p>No. It is a score produced by this model for this input. Calibration depends on data and conditions; classroom reliability must be measured on representative examples.</p>",
          )}
        `,
      },
    ],
    sources: [
      source("Shipped Hopper Studio COCO-SSD model manifest", "", "Exact shape and coefficient audit of public/models/coco-ssd/model.json and five local weight shards"),
      source(
        "TensorFlow.js COCO-SSD README",
        "https://github.com/tensorflow/tfjs-models/blob/master/coco-ssd/README.md",
        "Official package API, supported bases, 80 classes, and detector output",
      ),
      source(
        "MobileNetV2: Inverted Residuals and Linear Bottlenecks",
        "https://arxiv.org/abs/1801.04381",
        "Sandler et al.; MobileNetV2 and SSDLite architecture",
      ),
      source(
        "SSD: Single Shot MultiBox Detector",
        "https://arxiv.org/abs/1512.02325",
        "Liu et al.; multiscale default-box detector",
      ),
      source(
        "COCO dataset",
        "https://cocodataset.org/",
        "Official dataset site",
      ),
    ],
  }),

  lesson({
    number: "07",
    slug: "07-teachable-machine-models",
    kicker: "Teach a classifier with examples",
    title: "Teachable Machine image models",
    summary:
      "Design classes, collect balanced evidence, export the correct three files, and understand why a whole-frame classifier is not an object detector.",
    duration: "26 min",
    level: "Custom machine learning",
    objectives: [
      "Choose class definitions that match a real decision.",
      "Collect balanced train/validation examples across likely conditions.",
      "Export and load model.json, weights.bin, and metadata.json together.",
      "Explain input shape, output shape, and why parameter count varies by export.",
    ],
    sections: [
      {
        id: "classifier",
        title: "Classification labels the whole frame",
        html: `
          <p class="lesson-lede">A Teachable Machine image model returns one score for each class you created. It does not automatically locate the object with a bounding box.</p>
          ${cards([
            { tag: "Input", title: "A square image crop", body: "The library center-crops the current frame and resizes it to the export metadata image size; the standard workflow defaults to 224 × 224 RGB." },
            { tag: "Features", title: "A MobileNet-family backbone", body: "Transfer learning reuses visual features from a compact image network, then learns a small class-specific output head." },
            { tag: "Output", title: "One score per class", body: "With k classes, the output vector has k entries. Hopper returns every label in metadata order as className and probability." },
            { tag: "Runs where?", title: "On the host", body: "Hopper Studio loads the files and runs inference locally in the browser/desktop app, not on the flight controller." },
          ])}
          ${callout(
            "Not a fixed architecture",
            "The uploaded export determines the class count, exact graph, and coefficient count. Do not quote one universal Teachable Machine parameter number. Inspect the actual model.json and weight manifest when an exact count matters.",
            "gold",
          )}
        `,
      },
      {
        id: "classes",
        title: "Your class design defines the question",
        html: `
          <p>A two-class model called “landing pad” and “not landing pad” asks a useful decision question. A model called “Class 1” and “Class 2” hides what the examples mean.</p>
          ${table(
            ["Design choice", "Weak version", "Stronger version"],
            [
              ["Class names", "thing / other", "landing-pad / background"],
              ["Background", "Only empty wall", "Floor, hands, furniture, shadows, and near-misses"],
              ["Balance", "300 target, 20 background", "Comparable counts and variety per class"],
              ["Variation", "One angle and distance", "Expected distances, rotations, light, and partial views"],
              ["Validation", "Reuse training frames", "Hold out a separate scene or recording"],
            ],
          )}
          <figure class="lesson-figure">
            <div class="lesson-figure__frame">
              <img src="assets/images/teachable-machine-classes.png" width="3096" height="1668" alt="Teachable Machine interface with two image classes, training, and preview panels">
            </div>
            <figcaption>Supplied high-resolution screenshot. Rename classes before collecting data so every sample has an intentional meaning.</figcaption>
          </figure>
        `,
      },
      {
        id: "training",
        title: "Collect evidence, not duplicates",
        html: `
          <ol>
            <li>Create a <strong>Standard image model</strong>, not the embedded 96 × 96 grayscale option.</li>
            <li>Name the target class and a deliberately broad background/other class.</li>
            <li>Record short bursts from different positions instead of many near-identical consecutive frames.</li>
            <li>Separate a test set before training. Do not tune repeatedly on the same examples and call it validation.</li>
            <li>Inspect a confusion matrix or at least a table of expected versus predicted labels across the held-out set.</li>
          </ol>
          <figure class="lesson-figure">
            <div class="lesson-figure__frame">
              <img src="assets/images/teachable-machine-new-project.png" width="2786" height="1934" alt="Teachable Machine new image project dialog showing standard 224 by 224 color and embedded 96 by 96 grayscale model choices">
            </div>
            <figcaption>The current supplied interface describes the standard model as 224 × 224 color and roughly 5 MB, and the embedded model as 96 × 96 grayscale. File size and architecture can change with the export; treat “around 5 MB” as UI guidance, not a fixed parameter count.</figcaption>
          </figure>
          ${equation(
            String.raw`\operatorname{softmax}(z_i)=
              \frac{e^{z_i}}{\sum_{j=1}^{k}e^{z_j}}`,
            "A common final layer converts k class logits into scores that sum to 1. High relative score does not guarantee real-world correctness.",
          )}
        `,
      },
      {
        id: "export",
        title: "Hopper expects exactly three files",
        html: `
          ${table(
            ["File", "Role", "Hopper requirement"],
            [
              ["model.json", "Graph topology plus references to weight data", "Choose the exported TensorFlow.js model file."],
              ["weights.bin", "Stored numeric coefficients", "Choose the matching binary file from the same export."],
              ["metadata.json", "Labels, image size, and package metadata", "Filename must be metadata.json in the current UI."],
            ],
          )}
          <p>Load all three together in Vision Testing. The Studio returns the metadata labels, center-crops the current frame, uses no horizontal flip, and evaluates the whole frame.</p>
          ${codeBlock("javascript", "Use an already-loaded custom model", [
            "const predictions = await vision.classifyCustomModel();",
            "",
            "for (const item of predictions) {",
            "  console.log(item.className, item.probability.toFixed(3));",
            "}",
            "",
            "const padVisible = await vision.seesCustomLabel(",
            "  \"landing-pad\",",
            "  0.75,",
            ");",
          ].join("\n"))}
          ${codeBlock("python", "Python custom-class decision", [
            "predictions = scan_custom_model()",
            "for item in predictions:",
            "    print(item.className, item.probability)",
            "",
            "if sees_custom_label(\"landing-pad\", confidence=0.75):",
            "    print(\"Landing-pad class is above threshold\")",
          ].join("\n"))}
        `,
      },
      {
        id: "evaluate",
        title: "Measure performance in the deployment scene",
        html: `
          ${equation(
            String.raw`\text{precision}=\frac{TP}{TP+FP},\qquad
              \text{recall}=\frac{TP}{TP+FN}`,
            "Precision asks how many positive predictions were correct. Recall asks how many real positives were found.",
          )}
          ${cards([
            { tag: "False positive", title: "Unsafe enthusiasm", body: "The model announces the target when it is absent. Add hard negatives and require repeated confirmation." },
            { tag: "False negative", title: "Missed target", body: "The target is present but scores below threshold. Add diverse target examples and improve framing." },
            { tag: "Shortcut", title: "Background leakage", body: "The model learns a table, hand, or lighting pattern rather than the intended object." },
            { tag: "Drift", title: "Camera mismatch", body: "Training webcam imagery differs from the drone feed in crop, exposure, blur, or viewpoint." },
          ])}
          ${callout(
            "Package compatibility note",
            "The course app uses @teachablemachine/image 0.8.5 with TensorFlow.js 4.22.0 even though the older library declares a 1.3.1 peer. Treat custom-model replacement and disposal as a tested compatibility requirement for this build.",
            "caution",
          )}
          ${check(
            "Why can a three-class model have a different parameter count from a five-class model?",
            "<p>The final classification head has one output per class. Changing k changes the final weight matrix and bias vector; different Teachable Machine export versions can also change the backbone or metadata.</p>",
          )}
        `,
      },
    ],
    sources: [
      source(
        "Teachable Machine",
        "https://teachablemachine.withgoogle.com/",
        "Official browser-based training tool",
      ),
      source(
        "Teachable Machine image library",
        "https://github.com/googlecreativelab/teachablemachine-community/tree/master/libraries/image",
        "Official loading, metadata, 224 px default, and prediction API",
      ),
      source("Hopper Studio custom-model runtime", "", "Verified against lib/vision.ts and the installed @teachablemachine/image package"),
    ],
  }),

  lesson({
    number: "08",
    slug: "08-apriltags-with-hopper",
    kicker: "Engineered landmarks for repeatable vision",
    title: "AprilTags with Hopper",
    summary:
      "Understand the tag36h11 family, the local detection pipeline, normalized pose fields, and the exact limits of Hopper’s centering controller.",
    duration: "26 min",
    level: "Robotics vision",
    objectives: [
      "Explain why a fiducial marker can be more reliable than natural imagery.",
      "Describe the tag36h11 ID range and local detection pipeline.",
      "Interpret centerX, centerY, yaw, and hamming without inventing 3D pose.",
      "Use centerOnAprilTag with tolerances, timeout, and a safe fallback.",
    ],
    sections: [
      {
        id: "fiducial",
        title: "A fiducial is designed to be found",
        html: `
          <p class="lesson-lede">An AprilTag is a high-contrast square marker whose border helps locate a quadrilateral and whose interior bits encode an ID with error separation.</p>
          ${cards([
            { tag: "Family", title: "tag36h11", body: "Hopper Studio’s detector and printable tags use this family. “36” refers to data bits; “11” is the minimum Hamming separation between valid codes." },
            { tag: "IDs", title: "0 through 586", body: "The local family contains 587 valid tags. Choose an ID intentionally and record its role in the experiment." },
            { tag: "Algorithm", title: "Not a neural network", body: "The local CPU pipeline thresholds, finds quadrilateral candidates, samples a bit grid, and decodes the nearest valid code." },
            { tag: "Strength", title: "Known visual structure", body: "The detector does not need to learn every classroom background because the marker’s geometry and code are engineered." },
          ])}
          ${callout(
            "Family compatibility",
            "An AprilTag image from another family is not interchangeable. The general AprilTag 3 project now recommends tagStandard41h12 for many new systems, but this course runtime specifically expects tag36h11.",
            "gold",
          )}
        `,
      },
      {
        id: "pipeline",
        title: "From grayscale to an ID",
        html: `
          <ol>
            <li>Capture a frame up to 520 px wide and convert it to grayscale.</li>
            <li>Choose a binary split with Otsu-style thresholding.</li>
            <li>Find connected dark/light regions and quadrilateral candidates.</li>
            <li>Sample an 8 × 8 grid through the candidate’s corner geometry.</li>
            <li>Check the border and decode the 36 data bits against tag36h11 codes.</li>
            <li>Accept only bounded errors; keep at most one detection per ID.</li>
          </ol>
          ${equation(
            String.raw`d_H(\mathbf{a},\mathbf{b})=
              \sum_{i=1}^{36}\mathbf{1}[a_i\ne b_i]`,
            "Hamming distance counts different bits. The local detector accepts only a small number of bit errors when matching a valid code.",
          )}
          ${table(
            ["Detection field", "Meaning", "Not the same as"],
            [
              ["id", "Decoded integer 0…586", "A semantic class such as “landing pad”"],
              ["centerX / centerY", "Normalized image center, −100…100; right/up positive", "World x/y in meters"],
              ["corners / bbox", "Image pixel geometry", "Calibrated camera pose"],
              ["yaw", "Image-plane marker rotation, about (−180°, 180°]", "Full 3D aircraft-to-tag yaw"],
              ["hamming", "Number of corrected data-bit errors", "Confidence probability"],
            ],
          )}
        `,
      },
      {
        id: "pose",
        title: "2D alignment is not 3D pose",
        html: `
          <p class="lesson-lede">A square in an image contains clues about 3D orientation, but physical pose requires camera calibration and a known tag size. Hopper Studio deliberately reports only image geometry and image-plane yaw.</p>
          ${equation(
            String.raw`s
              \begin{bmatrix}u\\v\\1\end{bmatrix}
              =
              K\,[R\mid\mathbf{t}]
              \begin{bmatrix}X\\Y\\Z\\1\end{bmatrix}`,
            "A calibrated pinhole-camera model. K contains camera intrinsics; R and t describe physical pose. The course detector does not solve this full equation.",
          )}
          ${callout(
            "No range estimate",
            "The current detection has no tag size, focal length, depth, distance, altitude, or 3D translation. Apparent size can change with tilt as well as distance.",
            "caution",
          )}
        `,
      },
      {
        id: "centering",
        title: "The centering command is a bounded feedback loop",
        html: `
          <p><code>centerOnAprilTag</code> scans after every movement. It corrects the dominant center error with a short roll or pitch pulse, stabilizes, rescans, and only then corrects image-plane yaw.</p>
          ${apiList([
            { signature: "id = \"any\"", label: "Target", detail: "Use any or a rounded numeric ID. any chooses the visible tag nearest image center." },
            { signature: "translationPower = 10", label: "0…100%", detail: "Clamped motor-control percentage used for roll/pitch correction pulses." },
            { signature: "centerSlack = 5", label: "1…35%", detail: "Required absolute x and y image error before translation is considered centered." },
            { signature: "angleSlack = 5", label: "1…45°", detail: "Required absolute image-plane yaw error." },
            { signature: "lostTagSearches = 3", label: "1…20 scans", detail: "Consecutive missed scans allowed before returning false." },
            { signature: "30-second hard deadline", label: "Timeout", detail: "Returns false and resets movement if the loop cannot finish in time." },
          ])}
          ${codeBlock("javascript", "Center, check return value, and land", [
            "await drone.takeOff();",
            "try {",
            "  const aligned = await vision.centerOnAprilTag(",
            "    drone,",
            "    7,  // tag ID",
            "    10, // translation power %",
            "    5,  // center slack %",
            "    5,  // angle slack degrees",
            "    3,  // allowed lost scans",
            "  );",
            "  console.log(aligned ? \"Aligned\" : \"Alignment failed safely\");",
            "} finally {",
            "  drone.reset();",
            "  await drone.land();",
            "}",
          ].join("\n"))}
          ${callout(
            "What it does not control",
            "The loop does not regulate altitude, camera-to-tag distance, forward collision, landing, or a globally calibrated pose. An aligned tag can still be too near, too far, or at an unsafe height.",
            "caution",
          )}
        `,
      },
      {
        id: "experiment",
        title: "Design a tag experiment with geometry",
        html: `
          <ol>
            <li>Print one tag at high contrast with a quiet white margin. Do not resample it with smoothing.</li>
            <li>Measure the printed black-border dimension even if the current lesson does not use physical pose.</li>
            <li>Test detection across distance, pitch, yaw, partial occlusion, and illumination.</li>
            <li>Record ID accuracy, missed scans, hamming corrections, center error, and runtime.</li>
            <li>Choose center and angle slack from observed noise—not from aesthetics.</li>
            <li>Include a lost-tag branch that hovers or lands; never continue blindly on stale geometry.</li>
          </ol>
          ${codeBlock("python", "Python · a conservative tag check", [
            "take_off()",
            "try:",
            "    aligned = center_on_april_tag(id=7, power=10, center_slack=5, angle_slack=5, lost_searches=3)",
            "    print(\"aligned:\", aligned)",
            "finally:",
            "    reset_motion()",
            "    land()",
          ].join("\n"))}
          ${check(
            "Why does a larger tag often detect farther away?",
            "<p>At the same distance, it occupies more pixels. The border, corners, and 36 data bits survive downsampling and blur better. This improves 2D decoding but still does not create a calibrated distance measurement.</p>",
          )}
        `,
      },
    ],
    sources: [
      source("Hopper Studio tag36h11 detector", "", "Verified against lib/apriltags.ts and lib/vision.ts"),
      source(
        "AprilTag 3",
        "https://github.com/AprilRobotics/apriltag",
        "Official implementation, papers, detector guidance, and calibrated pose requirements",
      ),
      source(
        "AprilTag: A robust and flexible visual fiducial system",
        "https://april.eecs.umich.edu/media/pdfs/olson2011tags.pdf",
        "Olson; original AprilTag paper",
      ),
    ],
  }),

  lesson({
    number: "09",
    slug: "09-python-coding-reference",
    kicker: "Readable missions in a classroom subset",
    title: "Python coding reference",
    summary:
      "Every supported Python command and helper, with explicit defaults, named arguments, return shapes, language differences, and safe mission patterns.",
    duration: "38 min",
    level: "Python",
    objectives: [
      "Use the complete Hopper Python command surface without await.",
      "Pass required and optional arguments by the documented names.",
      "Recognize where this classroom transpiler differs from CPython.",
      "Write a mission with a guaranteed landing path and current vision evidence.",
    ],
    sections: [
      {
        id: "runtime",
        title: "This looks like Python and runs through a transpiler",
        html: `
          <p class="lesson-lede">Hopper Studio translates a deliberately limited Python-like language into the same asynchronous JavaScript API used by the Blocks and JavaScript editors.</p>
          ${cards([
            { tag: "Convenience", title: "No await keyword", body: "Supported Hopper commands automatically wait when translated. Writing await is rejected." },
            { tag: "Scope", title: "Classroom subset", body: "Assignments, decisions, loops, simple functions, exceptions, break/continue, return, raise, and assert are supported." },
            { tag: "Not supported", title: "Not CPython", body: "Imports, classes, async, lambda, with, yield, and other advanced statements are rejected." },
            { tag: "Returned data", title: "JavaScript field names", body: "Objects keep fields such as whiteCoverage, centerX, className, and probability." },
          ])}
          ${callout(
            "Defaults now match the reference",
            "The transpiler materializes documented optional values before calling the JavaScript runtime. Even so, explicit flight duration and power are clearer and safer than relying on defaults.",
            "gold",
          )}
        `,
      },
      {
        id: "flight",
        title: "Flight, state, and accessory commands",
        html: `
          ${apiList([
            { signature: "take_off()", label: "None", detail: "Takes off and waits for stabilization." },
            { signature: "land()", label: "None", detail: "Zeros movement, sends land, and waits." },
            { signature: "hover()", label: "None", detail: "Zeros motion axes and waits 1 second." },
            { signature: "wait(seconds)", label: "None", detail: "Waits a nonnegative duration." },
            { signature: "fly(direction, seconds=1, power=15)", label: "None", detail: "Direction: up, down, left, right, forward, backward. Power is normally 0…100%. Specify duration and power in flight code." },
            { signature: "rotate(degrees=0, direction=\"clockwise\")", label: "None", detail: "Direction: clockwise or counterclockwise." },
            { signature: "flip(direction)", label: "None", detail: "Direction: forward, backward, left, right. Requires clearance." },
            { signature: "set_axis(axis, power)", label: "None", detail: "Axis: pitch, roll, yaw, gaz, or altitude. Signed −100…100 and persistent." },
            { signature: "reset_motion()", label: "None", detail: "Zeros axes. Does not land." },
            { signature: "battery_level()", label: "number or null-like value", detail: "Reported battery percentage when telemetry exists." },
            { signature: "is_flying() / is_landed()", label: "bool", detail: "Reads the controller state." },
            { signature: "wait_for_battery_change()", label: "None", detail: "Waits for new battery telemetry or program cancellation." },
            { signature: "take_photo()", label: "None", detail: "Captures and stores the current Studio camera/simulator frame." },
            { signature: "open_grabber() / close_grabber()", label: "None", detail: "Requires the claw accessory." },
            { signature: "fire_gun()", label: "None", detail: "Requires the cannon accessory." },
            { signature: "emergency_cutoff()", label: "None", detail: "Immediately stops motors; emergency only." },
          ])}
          ${codeBlock("python", "Explicit flight mission", [
            "take_off()",
            "",
            "try:",
            "    fly(\"forward\", seconds=1.5, power=15)",
            "    hover()",
            "    rotate(degrees=90, direction=\"clockwise\")",
            "    take_photo()",
            "finally:",
            "    reset_motion()",
            "    land()",
          ].join("\n"))}
        `,
      },
      {
        id: "vision",
        title: "Vision commands",
        html: `
          ${apiList([
            { signature: "scan_threshold(threshold=60, invert=False)", label: "ThresholdResult", detail: "Fresh binary scan. Fields use camelCase: whiteCoverage, blackCoverage, centerWhite, frameWidth, frameHeight." },
            { signature: "sees_binary(color, threshold=60, invert=False, coverage=10)", label: "bool", detail: "Fresh scan; color is white or black; coverage is percent." },
            { signature: "binary_center(color, threshold=60, invert=False)", label: "bool", detail: "Fresh scan; checks only the center pixel." },
            { signature: "load_object_model()", label: "model", detail: "Loads the local COCO-SSD model. Usually the first object scan can load it automatically." },
            { signature: "scan_objects(confidence=0.55)", label: "detections", detail: "Fresh COCO-SSD scan. Confidence is 0…1." },
            { signature: "detect_objects(confidence=0.55)", label: "detections", detail: "Exact alias of scan_objects." },
            { signature: "sees_object(label, confidence=0.55)", label: "bool", detail: "Fresh scan and exact case-insensitive COCO label." },
            { signature: "object_coordinate(label, axis, confidence=0.55)", label: "number", detail: "Stored coordinate, no fresh scan. Axis x or y; −100…100; right/up positive." },
            { signature: "object_x(label, confidence=0.55) / object_y(...)", label: "number", detail: "Convenience wrappers for stored x or y." },
            { signature: "scan_april_tags()", label: "tag detections", detail: "Fresh tag36h11 scan." },
            { signature: "sees_april_tag(id=\"any\")", label: "bool", detail: "Fresh scan; any or ID 0…586." },
            { signature: "center_on_april_tag(id=\"any\", power=10, center_slack=5, angle_slack=5, lost_searches=3)", label: "bool", detail: "Bounded 2D centering/alignment loop; no altitude or distance control." },
            { signature: "scan_custom_model()", label: "predictions", detail: "Fresh whole-frame Teachable Machine classification." },
            { signature: "sees_custom_label(label, confidence=0.75)", label: "bool", detail: "Fresh classification and exact label." },
          ])}
          ${codeBlock("python", "Fresh object scan before stored coordinate", [
            "confidence = 0.55",
            "",
            "if sees_object(\"bottle\", confidence=confidence):",
            "    x = object_x(\"bottle\", confidence=confidence)",
            "    y = object_y(\"bottle\", confidence=confidence)",
            "    print(f\"bottle center: ({x}, {y})\")",
            "else:",
            "    print(\"No current bottle detection\")",
          ].join("\n"))}
        `,
      },
      {
        id: "program-state",
        title: "Program state and keyboard helpers",
        html: `
          ${apiList([
            { signature: "stopped()", label: "bool", detail: "True after the runtime is stopped; useful in a while loop." },
            { signature: "key_pressed(key)", label: "bool", detail: "Keys: lowercase letters, ArrowUp/Down/Left/Right, or Space." },
            { signature: "print(*values)", label: "None", detail: "Writes values to the Studio console." },
          ])}
          ${codeBlock("python", "Poll a key without a busy loop", [
            "take_off()",
            "try:",
            "    while not stopped():",
            "        if key_pressed(\"ArrowUp\"):",
            "            set_axis(\"pitch\", 10)",
            "        else:",
            "            reset_motion()",
            "        wait(0.05)",
            "finally:",
            "    reset_motion()",
            "    land()",
          ].join("\n"))}
          ${callout(
            "Always yield",
            "A while loop should contain wait() or another waiting Hopper command. Otherwise it can monopolize the browser and delay Stop handling.",
            "caution",
          )}
        `,
      },
      {
        id: "helpers",
        title: "Classroom helper functions",
        html: `
          ${table(
            ["Helper", "Supported form", "Difference worth knowing"],
            [
              ["len(value)", "Length or 0 for a null-like value", "Uses JavaScript .length."],
              ["range(stop) / range(start, stop, step)", "Returns an array; finite numbers; step ≠ 0", "Floats are accepted."],
              ["contains(collection, value)", "Membership test", "Uses Set/Map has or includes when available."],
              ["abs, min, max", "Numeric helpers", "Empty min/max follow JavaScript infinities."],
              ["round(value)", "One value", "Uses Math.round, not Python banker’s rounding; no ndigits."],
              ["int(value)", "Truncate Number(value)", "Conversion behavior follows JavaScript."],
              ["float(value)", "Number(value)", "Conversion behavior follows JavaScript."],
              ["str(value)", "String(value)", "<code>str(None)</code> becomes <code>\"null\"</code>."],
              ["bool(value)", "Boolean(value)", "Unlike Python, an empty list is truthy."],
            ],
          )}
          ${callout(
            "Portable thinking",
            "Use this editor for course missions, not as a general Python interpreter. If a language edge case matters, rewrite it in a simple explicit form or test it in real CPython separately.",
            "gold",
          )}
        `,
      },
      {
        id: "syntax",
        title: "Supported control flow",
        html: `
          <p>Supported statements include assignments, <code>if / elif / else</code>, <code>while</code>, <code>for … in</code>, simple <code>def</code>, <code>try / except / finally</code>, <code>break</code>, <code>continue</code>, <code>pass</code>, <code>return</code>, <code>raise</code>, and <code>assert</code>. User-defined function parameters must be simple names; default-valued parameters and type annotations are not supported.</p>
          ${codeBlock("python", "Function, loop, and exception pattern", [
            "def confirm_object(label, confidence, attempts):",
            "    hits = 0",
            "    for attempt in range(attempts):",
            "        if sees_object(label, confidence=confidence):",
            "            hits = hits + 1",
            "        wait(0.15)",
            "    return hits >= 2",
            "",
            "take_off()",
            "try:",
            "    if confirm_object(\"bottle\", 0.55, 3):",
            "        fly(\"forward\", seconds=1, power=15)",
            "    else:",
            "        hover()",
            "except:",
            "    print(\"Mission command failed\")",
            "finally:",
            "    reset_motion()",
            "    land()",
          ].join("\n"))}
          ${check(
            "Why does the example call land() inside finally?",
            "<p>The finally block runs after the try body whether it succeeds or raises an error. It documents and enforces the mission’s safe terminal action.</p>",
          )}
        `,
      },
    ],
    sources: [
      source("Hopper Studio Python transpiler", "", "Verified against lib/python.ts and the shared JavaScript command implementations"),
      source(
        "Python language reference",
        "https://docs.python.org/3/reference/",
        "CPython reference used to explain where the classroom subset differs",
      ),
    ],
  }),
];

export const lessonAssets = [
  "hopper-underbody-generated.jpg",
  "x-quadrotor-generated.jpg",
  "x-quadrotor-top-generated.jpg",
  "hopper-underbody-photo.jpg",
  "hopper-top-photo.jpg",
  "teachable-machine-new-project.png",
  "teachable-machine-classes.png",
];
