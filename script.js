(() => {
	const waxml = window.webAudioXML;
	const musicToggle = document.querySelector("#music-toggle");
	const feelingToggle = document.querySelector("#feeling-toggle");
	let waxmlReady = false;
	let musicPlaying = false;
	let musicMode = "A";
	let startBallMotion = () => {};
	let resetToSingleBall = () => {};
	const debugAudioTriggers = new URLSearchParams(window.location.search).has("debugAudio");
	const audioTriggerLog = [];
	const recentTriggerTimes = [];
	window.audioTriggerLog = audioTriggerLog;
	window.clearAudioTriggerLog = () => {
		audioTriggerLog.length = 0;
		recentTriggerTimes.length = 0;
	};

	function logAudioTrigger(selector, details = {}) {
		if (!debugAudioTriggers) return;

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
				waxml.stop(`.${musicMode}`);
				updateMusicToggle(false);
			} else {
				if (debugAudioTriggers) logAudioTrigger(`.${musicMode}`, { event: "music-start", mode: musicMode });
				waxml.trig(`.${musicMode}`);
				updateMusicToggle(true);
				startBallMotion();
			}
		});
	}

	if (feelingToggle) {
		feelingToggle.addEventListener("click", () => {
			if (!waxmlReady) return;

			if (musicPlaying) waxml.stop(`.${musicMode}`);
			resetToSingleBall();
			musicMode = musicMode === "A" ? "B" : "A";
			updatePlayfieldMode();
			if (debugAudioTriggers) logAudioTrigger(`.${musicMode}`, { event: "feeling-switch", mode: musicMode });
			waxml.trig(`.${musicMode}`);
			updateMusicToggle(true);
			startBallMotion();
		});
	}

	if (waxml) {
		waxml.addEventListener("inited", () => {
			waxmlReady = true;
			updateMusicToggle(false);
		}, { once: true });
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
		let currentBallCount = Number(countButtons.find(button => button.getAttribute("aria-pressed") === "true")?.dataset.count) || 1;
		let currentSize = Number(sizeButtons.find(button => button.getAttribute("aria-pressed") === "true")?.dataset.size) || 60;
		let currentSpeed = Number(speedButtons.find(button => button.getAttribute("aria-pressed") === "true")?.dataset.speed) / 100 || 1;
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
			const nextSpeed = Number(button.dataset.speed) / 100;
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
			if (waxmlReady && stinger) {
				const ball = [...state.circle.classList].find(className => className.startsWith("ball-") && !className.includes("button"));
				const selector = `#${stinger}`;
				if (debugAudioTriggers) logAudioTrigger(selector, { event, ball, mode: musicMode });
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

		startBallMotion = () => {
			if (motionStarted) return;
			motionStarted = true;
			if (!reducedMotion) animateToNextEvent(simulationVersion);
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
		new ResizeObserver(resizeBalls).observe(playfield);
	}, { once: true });
})();
