(() => {
	const audioDisabled = new URLSearchParams(window.location.search).has("noAudio");
	const lowPowerMode = new URLSearchParams(window.location.search).has("lowPower");
	const debugAudioTriggers = new URLSearchParams(window.location.search).has("debugAudio");
	const rafMode = new URLSearchParams(window.location.search).has("raf");
	const showFps = new URLSearchParams(window.location.search).has("fps");
	const flatMode = new URLSearchParams(window.location.search).has("flat");
	const speedScale = lowPowerMode ? 0.5 : 1;
	const motionStartDelayMs = 500;
	const waxml = window.webAudioXML;
	const musicToggle = document.querySelector("#music-toggle");
	const feelingToggle = document.querySelector("#feeling-toggle");
	let waxmlReady = audioDisabled;
	let musicPlaying = false;
	let musicMode = "A";
	let startBallMotion = () => {};
	let resetToSingleBall = () => {};
	const audioTriggerLog = [];
	const recentTriggerTimes = [];
	window.audioTriggerLog = audioTriggerLog;
	window.clearAudioTriggerLog = () => {
		audioTriggerLog.length = 0;
		recentTriggerTimes.length = 0;
	};

	function logAudioTrigger(selector, details = {}) {
		const elapsedMs = performance.now();
		while (recentTriggerTimes.length && recentTriggerTimes[0] < elapsedMs - 1000) {
			recentTriggerTimes.shift();
		}
		recentTriggerTimes.push(elapsedMs);

		const entry = {
			elapsedMs: Math.round(elapsedMs * 10) / 10,
			audioTime: Number((waxml?._ctx?.currentTime || 0).toFixed(3)),
			selector,
			triggersLastSecond: recentTriggerTimes.length,
			...details
		};
		audioTriggerLog.push(entry);
		if (audioTriggerLog.length > 1000) audioTriggerLog.shift();
		console.info("[audio-trigger]", entry);
	}

	function createFpsMeter() {
		const element = document.createElement("div");
		element.className = "fps-meter";
		document.body.appendChild(element);
		let windowStart = performance.now();
		let lastTick = windowStart;
		let frames = 0;
		let maxInterval = 0;
		let workTotal = 0;
		let workMax = 0;
		let workCount = 0;

		const tick = now => {
			frames++;
			maxInterval = Math.max(maxInterval, now - lastTick);
			lastTick = now;
			if (now - windowStart >= 1000) {
				const fps = frames * 1000 / (now - windowStart);
				const work = workCount ? `${(workTotal / workCount).toFixed(1)}/${workMax.toFixed(1)} ms` : "-";
				element.textContent = `${fps.toFixed(0)} fps | max ${maxInterval.toFixed(0)} ms | js ${work}`;
				windowStart = now;
				frames = 0;
				maxInterval = 0;
				workTotal = 0;
				workMax = 0;
				workCount = 0;
			}
			requestAnimationFrame(tick);
		};
		requestAnimationFrame(tick);

		return {
			addWork(ms) {
				workTotal += ms;
				workMax = Math.max(workMax, ms);
				workCount++;
			}
		};
	}

	const fpsMeter = showFps ? createFpsMeter() : null;
	if (flatMode) document.body.classList.add("flat");

	function updateMusicToggle(isPlaying) {
		musicPlaying = isPlaying;
		if (!musicToggle) return;

		musicToggle.disabled = !waxmlReady;
		musicToggle.textContent = musicPlaying ? "停止" : "開始";
		musicToggle.setAttribute("aria-pressed", String(musicPlaying));
		if (feelingToggle) {
			feelingToggle.disabled = !waxmlReady;
			feelingToggle.setAttribute("aria-pressed", String(musicMode === "B"));
		}
	}

	if (musicToggle) {
		musicToggle.addEventListener("click", () => {
			if (!waxmlReady) return;

			if (musicPlaying) {
				if (waxml) waxml.stop(`.${musicMode}`);
				updateMusicToggle(false);
			} else {
				if (waxml) {
					if (debugAudioTriggers) logAudioTrigger(`.${musicMode}`, { event: "music-start", mode: musicMode });
					waxml.trig(`.${musicMode}`);
				}
				updateMusicToggle(true);
				startBallMotion();
			}
		});
	}

	if (feelingToggle) {
		feelingToggle.addEventListener("click", () => {
			if (!waxmlReady) return;

			if (musicPlaying && waxml) waxml.stop(`.${musicMode}`);
			resetToSingleBall();
			musicMode = musicMode === "A" ? "B" : "A";
			updatePlayfieldMode();
			if (waxml) {
				if (debugAudioTriggers) logAudioTrigger(`.${musicMode}`, { event: "feeling-switch", mode: musicMode });
				waxml.trig(`.${musicMode}`);
			}
			updateMusicToggle(true);
			startBallMotion();
		});
	}

	if (waxml) {
		waxml.addEventListener("inited", () => {
			waxmlReady = true;
			updateMusicToggle(false);
		}, { once: true });
	} else if (audioDisabled) {
		updateMusicToggle(false);
	}

	const playfield = document.querySelector("#ball-playfield");
	const circles = [...document.querySelectorAll(".bouncing-circle")];
	const countButtons = [...document.querySelectorAll(".ball-count-button")];
	const sizeButtons = [...document.querySelectorAll(".ball-size-button")];
	const speedButtons = [...document.querySelectorAll(".ball-speed-button")];
	if (!playfield || !circles.length || !countButtons.length || !sizeButtons.length || !speedButtons.length) {
		return;
	}

	function updatePlayfieldMode() {
		playfield.classList.toggle("mode-b", musicMode === "B");
	}

	window.addEventListener("load", () => {
		const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
		let motionStarted = false;
		let motionStartPending = false;
		let currentBallCount = Number(countButtons.find(button => button.getAttribute("aria-pressed") === "true")?.dataset.count) || 1;
		let currentSize = Number(sizeButtons.find(button => button.getAttribute("aria-pressed") === "true")?.dataset.size) || 60;
		let currentSpeed = (Number(speedButtons.find(button => button.getAttribute("aria-pressed") === "true")?.dataset.speed) / 100 || 1) * speedScale;
		let states = [];
		let simulationVersion = 0;
		const sizeAnimations = new WeakMap();

		function applyBallSize(circle, size) {
			const previousAnimation = sizeAnimations.get(circle);
			const animation = circle.animate(
				[{ width: `${size}px`, height: `${size}px` }],
				{ duration: 0, fill: "forwards" }
			);
			if (previousAnimation) previousAnimation.cancel();
			sizeAnimations.set(circle, animation);
			circle.getBoundingClientRect();
		}

		function createState(circle) {
			const radius = circle.offsetWidth / 2;
			const maxX = playfield.clientWidth - circle.offsetWidth;
			const maxY = playfield.clientHeight - circle.offsetHeight;
			let x = maxX / 2;
			let y = maxY / 2;

			for (let attempt = 0; states.length && attempt < 500; attempt++) {
				const candidateX = Math.random() * maxX;
				const candidateY = Math.random() * maxY;
				const available = states.every(state => {
					const distance = Math.hypot(
						candidateX + radius - state.x - state.radius,
						candidateY + radius - state.y - state.radius
					);
					return distance >= radius + state.radius + 8;
				});
				if (available) {
					x = candidateX;
					y = candidateY;
					break;
				}
			}

			const speed = (220 + Math.random() * 60) * currentSpeed;
			const angle = Math.random() * Math.PI * 2;
			return {
				circle,
				radius,
				minX: 0,
				minY: 0,
				maxX,
				maxY,
				x,
				y,
				targetX: x,
				targetY: y,
				velocityX: Math.cos(angle) * speed,
				velocityY: Math.sin(angle) * speed,
				animation: null
			};
		}

		function stopAtCurrentPosition(state) {
			if (!state.animation) return;

			const transform = getComputedStyle(state.circle).transform;
			if (transform !== "none") {
				const matrix = new DOMMatrixReadOnly(transform);
				state.x = matrix.m41;
				state.y = matrix.m42;
			}
			state.targetX = state.x;
			state.targetY = state.y;
			state.animation.onfinish = null;
			state.animation.cancel();
			state.animation = null;
		}

		function holdAtPosition(state) {
			if (rafMode) {
				renderState(state);
				return;
			}
			state.targetX = state.x;
			state.targetY = state.y;
			state.animation = state.circle.animate(
				[{ transform: `translate(${state.x}px, ${state.y}px)` }],
				{ duration: 0, fill: "forwards" }
			);
		}

		function updateVisibleBalls() {
			const count = currentBallCount;
			const selectedCircles = new Set(circles.slice(0, count));
			simulationVersion++;
			states.forEach(stopAtCurrentPosition);

			states = states.filter(state => {
				if (selectedCircles.has(state.circle)) return true;
				state.circle.hidden = true;
				return false;
			});

			circles.forEach((circle, index) => {
				circle.hidden = index >= count;
				if (!circle.hidden && !states.some(state => state.circle === circle)) {
					states.push(createState(circle));
				}
			});

			if (reducedMotion || !motionStarted) {
				states.forEach(holdAtPosition);
			} else {
				animateToNextEvent(simulationVersion);
			}
		}

		function resizeBalls() {
			const size = currentSize;
			simulationVersion++;
			states.forEach(stopAtCurrentPosition);
			circles.forEach(circle => applyBallSize(circle, size));

			states.forEach(state => {
				const centerX = state.x + state.radius;
				const centerY = state.y + state.radius;
				state.radius = size / 2;
				state.maxX = playfield.clientWidth - size;
				state.maxY = playfield.clientHeight - size;
				const nextX = centerX - state.radius;
				const nextY = centerY - state.radius;
				state.x = Math.max(state.minX, Math.min(state.maxX, nextX));
				state.y = Math.max(state.minY, Math.min(state.maxY, nextY));
				if (state.x !== nextX) state.velocityX *= -1;
				if (state.y !== nextY) state.velocityY *= -1;
			});

			for (let pass = 0; pass < states.length; pass++) {
				for (let firstIndex = 0; firstIndex < states.length; firstIndex++) {
					for (let secondIndex = firstIndex + 1; secondIndex < states.length; secondIndex++) {
						const first = states[firstIndex];
						const second = states[secondIndex];
						const offsetX = second.x - first.x;
						const offsetY = second.y - first.y;
						const distance = Math.hypot(offsetX, offsetY) || 1;
						const overlap = first.radius + second.radius - distance;
						if (overlap <= 0) continue;

						const normalX = offsetX / distance;
						const normalY = offsetY / distance;
						first.x -= normalX * overlap / 2;
						first.y -= normalY * overlap / 2;
						second.x += normalX * overlap / 2;
						second.y += normalY * overlap / 2;
					}
				}
			}

			states.forEach(state => {
				state.x = Math.max(state.minX, Math.min(state.maxX, state.x));
				state.y = Math.max(state.minY, Math.min(state.maxY, state.y));
			});

			if (reducedMotion || !motionStarted) {
				states.forEach(holdAtPosition);
			} else {
				animateToNextEvent(simulationVersion);
			}
		}

		function selectBallSize(button) {
			currentSize = Number(button.dataset.size);
			sizeButtons.forEach(sizeButton => {
				sizeButton.setAttribute("aria-pressed", String(sizeButton === button));
			});
			resizeBalls();
		}

		function selectBallCount(button) {
			currentBallCount = Number(button.dataset.count);
			countButtons.forEach(countButton => {
				countButton.setAttribute("aria-pressed", String(countButton === button));
			});
			updateVisibleBalls();
		}

		resetToSingleBall = () => {
			if (currentBallCount === 1) return;
			const singleBallButton = countButtons.find(button => Number(button.dataset.count) === 1);
			if (singleBallButton) selectBallCount(singleBallButton);
		};

		function selectSpeed(button) {
			const nextSpeed = Number(button.dataset.speed) / 100 * speedScale;
			const speedRatio = nextSpeed / currentSpeed;
			currentSpeed = nextSpeed;
			speedButtons.forEach(speedButton => {
				speedButton.setAttribute("aria-pressed", String(speedButton === button));
			});
			simulationVersion++;
			states.forEach(stopAtCurrentPosition);
			states.forEach(state => {
				state.velocityX *= speedRatio;
				state.velocityY *= speedRatio;
			});

			if (reducedMotion || !motionStarted) {
				states.forEach(holdAtPosition);
			} else {
				animateToNextEvent(simulationVersion);
			}
		}

		function triggerStinger(state, event) {
			const stinger = state.circle.dataset[`stinger${musicMode}`];
			if (!audioDisabled && waxmlReady && waxml && stinger) {
				const ball = [...state.circle.classList].find(className => className.startsWith("ball-") && !className.includes("button"));
				const selector = `#${stinger}`;
				logAudioTrigger(selector, { event, ball, mode: musicMode });
				waxml.trig(selector);
			}
		}

		function timeToWall(state, axis) {
			const velocity = axis === "x" ? state.velocityX : state.velocityY;
			const position = axis === "x" ? state.x : state.y;
			const min = axis === "x" ? state.minX : state.minY;
			const max = axis === "x" ? state.maxX : state.maxY;
			if (velocity > 0) return (max - position) / velocity;
			if (velocity < 0) return (min - position) / velocity;
			return Infinity;
		}

		function timeToCollision(first, second) {
			const offsetX = second.x + second.radius - first.x - first.radius;
			const offsetY = second.y + second.radius - first.y - first.radius;
			const relativeVelocityX = second.velocityX - first.velocityX;
			const relativeVelocityY = second.velocityY - first.velocityY;
			const velocitySquared = relativeVelocityX ** 2 + relativeVelocityY ** 2;
			const positionVelocity = offsetX * relativeVelocityX + offsetY * relativeVelocityY;
			const radiusSum = first.radius + second.radius;
			const distanceSquared = offsetX ** 2 + offsetY ** 2;
			const distanceFromContact = distanceSquared - radiusSum ** 2;

			if (velocitySquared === 0 || positionVelocity >= 0) return Infinity;
			if (distanceFromContact <= 0) return 0;

			const discriminant = positionVelocity ** 2 - velocitySquared * distanceFromContact;
			if (discriminant < 0) return Infinity;
			return (-positionVelocity - Math.sqrt(discriminant)) / velocitySquared;
		}

		function nextEvents() {
			let seconds = Infinity;
			let events = [];
			const addEvent = (time, event) => {
				if (!Number.isFinite(time) || time < 0) return;
				if (time < seconds - 1e-7) {
					seconds = time;
					events = [event];
				} else if (Math.abs(time - seconds) <= 1e-7) {
					events.push(event);
				}
			};

			states.forEach(state => {
				addEvent(timeToWall(state, "x"), { type: "wall", state, axis: "x" });
				addEvent(timeToWall(state, "y"), { type: "wall", state, axis: "y" });
			});

			for (let firstIndex = 0; firstIndex < states.length; firstIndex++) {
				for (let secondIndex = firstIndex + 1; secondIndex < states.length; secondIndex++) {
					const first = states[firstIndex];
					const second = states[secondIndex];
					addEvent(timeToCollision(first, second), { type: "collision", first, second });
				}
			}

			return { seconds, events };
		}

		function resolveEvents(events) {
			const wallHits = new Set();
			events.filter(event => event.type === "wall").forEach(({ state, axis }) => {
				if (axis === "x") state.velocityX *= -1;
				else state.velocityY *= -1;
				wallHits.add(state);
			});
			wallHits.forEach(state => triggerStinger(state, "wall"));

			events.filter(event => event.type === "collision").forEach(({ first, second }) => {
				const offsetX = second.x + second.radius - first.x - first.radius;
				const offsetY = second.y + second.radius - first.y - first.radius;
				const distance = Math.hypot(offsetX, offsetY) || 1;
				const normalX = offsetX / distance;
				const normalY = offsetY / distance;
				const overlap = first.radius + second.radius - distance;
				if (overlap > 0) {
					first.x -= normalX * overlap / 2;
					first.y -= normalY * overlap / 2;
					second.x += normalX * overlap / 2;
					second.y += normalY * overlap / 2;
				}

				const relativeNormalVelocity =
					(second.velocityX - first.velocityX) * normalX +
					(second.velocityY - first.velocityY) * normalY;
				if (relativeNormalVelocity >= 0) return;

				const firstMass = first.radius ** 2;
				const secondMass = second.radius ** 2;
				const impulse = -2 * relativeNormalVelocity / (1 / firstMass + 1 / secondMass);
				first.velocityX -= impulse * normalX / firstMass;
				first.velocityY -= impulse * normalY / firstMass;
				second.velocityX += impulse * normalX / secondMass;
				second.velocityY += impulse * normalY / secondMass;
				triggerStinger(first, "collision");
				triggerStinger(second, "collision");
			});
		}

		function animateToNextEvent(version) {
			if (rafMode) {
				states.forEach(renderState);
				return;
			}
			if (!states.length || version !== simulationVersion) return;
			const { seconds, events } = nextEvents();
			if (!Number.isFinite(seconds)) return;

			const destinations = states.map(state => {
				let x = state.x + state.velocityX * seconds;
				let y = state.y + state.velocityY * seconds;
				events.forEach(event => {
					if (event.type !== "wall" || event.state !== state) return;
					if (event.axis === "x") x = state.velocityX > 0 ? state.maxX : state.minX;
					else y = state.velocityY > 0 ? state.maxY : state.minY;
				});
				state.targetX = x;
				state.targetY = y;
				return { x, y };
			});

			if (seconds <= 1e-7) {
				states.forEach((state, index) => {
					state.x = destinations[index].x;
					state.y = destinations[index].y;
				});
				resolveEvents(events);
				animateToNextEvent(version);
				return;
			}

			let finishedAnimations = 0;
			states.forEach((state, index) => {
				const destination = destinations[index];
				const previousAnimation = state.animation;
				state.animation = state.circle.animate(
					[
						{ transform: `translate(${state.x}px, ${state.y}px)` },
						{ transform: `translate(${destination.x}px, ${destination.y}px)` }
					],
					{ duration: seconds * 1000, easing: "linear", fill: "forwards" }
				);
				if (previousAnimation) previousAnimation.cancel();
				state.animation.onfinish = () => {
					if (version !== simulationVersion) return;
					if (++finishedAnimations !== states.length) return;
					states.forEach((currentState, stateIndex) => {
						currentState.x = destinations[stateIndex].x;
						currentState.y = destinations[stateIndex].y;
					});
					resolveEvents(events);
					animateToNextEvent(version);
				};
			});
		}

		function renderState(state) {
			state.circle.style.transform = `translate3d(${state.x}px, ${state.y}px, 0)`;
		}

		function advanceStates(seconds, events) {
			states.forEach(state => {
				state.x += state.velocityX * seconds;
				state.y += state.velocityY * seconds;
			});
			events.forEach(event => {
				if (event.type !== "wall") return;
				if (event.axis === "x") event.state.x = event.state.velocityX > 0 ? event.state.maxX : event.state.minX;
				else event.state.y = event.state.velocityY > 0 ? event.state.maxY : event.state.minY;
			});
			// Avrundning kan annars släppa ut en boll ur fältet.
			states.forEach(state => {
				state.x = Math.min(state.maxX, Math.max(state.minX, state.x));
				state.y = Math.min(state.maxY, Math.max(state.minY, state.y));
			});
		}

		function stepSimulation(dt) {
			let remaining = dt;
			for (let step = 0; step < 32 && remaining > 0; step++) {
				const { seconds, events } = nextEvents();
				if (seconds > remaining) {
					advanceStates(remaining, []);
					return;
				}
				advanceStates(seconds, events);
				resolveEvents(events);
				remaining -= seconds;
			}
		}

		let lastFrameTime = null;

		function frame(now) {
			const dt = lastFrameTime === null ? 0 : Math.min((now - lastFrameTime) / 1000, 0.1);
			lastFrameTime = now;
			const workStart = fpsMeter ? performance.now() : 0;
			stepSimulation(dt);
			states.forEach(renderState);
			if (fpsMeter) fpsMeter.addWork(performance.now() - workStart);
			requestAnimationFrame(frame);
		}

		startBallMotion = () => {
			if (motionStarted || motionStartPending) return;
			motionStartPending = true;
			// Låter loopen starta innan första träffens stingers tävlar om processorn.
			setTimeout(() => {
				motionStarted = true;
				if (reducedMotion) return;
				if (rafMode) requestAnimationFrame(frame);
				else animateToNextEvent(simulationVersion);
			}, motionStartDelayMs);
		};

		circles.forEach(circle => applyBallSize(circle, currentSize));
		countButtons.forEach(button => {
			button.addEventListener("click", () => selectBallCount(button));
		});
		speedButtons.forEach(button => {
			button.addEventListener("click", () => selectSpeed(button));
		});
		sizeButtons.forEach(button => {
			button.addEventListener("click", () => selectBallSize(button));
		});
		updateVisibleBalls();
	}, { once: true });
})();
