import { Object3D, Quaternion, Vector3 } from "three";
import { clamp } from "three/src/math/MathUtils";

import { r180, r360, r90 } from "@kitsune/common";

// const changeEvent = { type: "change" };

const EPS = 0.000001;
const _tmpQuaternion = new Quaternion();

// TODO: Re-implement rolling via keyboard

export type FlyControlsOptions = {
	movementSpeed?: number; // world units per second (Shift holds a 4× boost)
	rollSpeed?: number;
};

export const FlyControls = (
	object: Object3D, domElement: HTMLElement, options: FlyControlsOptions = {},
) => {

	let enabled = true;

	let movementSpeed = options.movementSpeed ?? 1;
	let movementSpeedMultiplier = 1;
	let rollSpeed = options.rollSpeed ?? 1;

	let dragToLook = false;
	let autoForward = false;

	// internals
	let moveState = {
		up: 0, down: 0, left: 0, right: 0, forward: 0, back: 0,
		pitchUp: 0, pitchDown: 0, yawLeft: 0, yawRight: 0, rollLeft: 0, rollRight: 0
	};

	let _moveVector = new Vector3(0, 0, 0);
	let _rotationVector = new Vector3(0, 0, 0);
	let _lastQuaternion = new Quaternion();
	let _lastPosition = new Vector3();
	let _status = 0;

	// Rotation — initialized from the object's CURRENT view DIRECTION, so taking over an
	// already-posed camera continues from its view instead of snapping. NOT an euler
	// decomposition: for yaw beyond ±90°, setFromQuaternion(…, "ZYX") returns the twin solution
	// with roll = π, and zeroing THAT roll flips the view ~180° on the first update (the
	// "camera jumps when the pointer locks" bug). The forward vector is unambiguous; inverting
	// update()'s convention — forward = (−sinθ·cosφ′, sinφ′, −cosθ·cosφ′), φ′ = phi − 90° —
	// recovers theta/phi exactly for any roll-free pose, so the first update() reproduces the
	// camera's pose verbatim and nothing moves until the mouse does.
	const _fwd = new Vector3(0, 0, -1).applyQuaternion(object.quaternion);
	let theta: number = Math.atan2(-_fwd.x, -_fwd.z); // Horizontal: -Math.PI to Math.PI
	let phi: number = clamp(Math.asin(clamp(_fwd.y, -1, 1)) + r90, 0, r180); // Vertical: 0 (top) to Math.PI (bottom)

	const updateMovementVector = () => {
		const forward = (moveState.forward || (autoForward && !moveState.back)) ? 1 : 0;

		_moveVector.x = (- moveState.left + moveState.right);
		_moveVector.y = (- moveState.down + moveState.up);
		_moveVector.z = (- forward + moveState.back);

		//console.log( 'move:', [ _moveVector.x, _moveVector.y, _moveVector.z ] );
	}

	const updateRotationVector = () => {
		_rotationVector.x = (-moveState.pitchDown + moveState.pitchUp);
		_rotationVector.y = (-moveState.yawRight + moveState.yawLeft);
		_rotationVector.z = (-moveState.rollRight + moveState.rollLeft);

		//console.log( 'rotate:', [ _rotationVector.x, _rotationVector.y, _rotationVector.z ] );
	}

	const onKeyDown = (event: KeyboardEvent)  => {
		if (event.altKey || !enabled)
			return;

		switch (event.code) {
			case "ShiftLeft":
			case "ShiftRight": movementSpeedMultiplier = 4; break;

			case "KeyW": moveState.forward = 1; break;
			case "KeyS": moveState.back = 1; break;

			case "KeyA": moveState.left = 1; break;
			case "KeyD": moveState.right = 1; break;

			case "KeyR": moveState.up = 1; break;
			case "KeyF": moveState.down = 1; break;

			case "ArrowLeft": moveState.yawLeft = 1; break;
			case "ArrowRight": moveState.yawRight = 1; break;

			case "ArrowUp": moveState.pitchUp = 1; break;
			case "ArrowDown": moveState.pitchDown = 1; break;

			case "KeyQ": moveState.rollLeft = 1; break;
			case "KeyE": moveState.rollRight = 1; break;
		}

		updateMovementVector();
		updateRotationVector();
	}

	const onKeyUp = (event: KeyboardEvent) => {
		if (!enabled)
			return;

		switch (event.code) {

			case "ShiftLeft":
			case "ShiftRight": movementSpeedMultiplier = 1; break;

			case "KeyW": moveState.forward = 0; break;
			case "KeyS": moveState.back = 0; break;

			case "KeyA": moveState.left = 0; break;
			case "KeyD": moveState.right = 0; break;

			case "KeyR": moveState.up = 0; break;
			case "KeyF": moveState.down = 0; break;

			case "ArrowLeft": moveState.yawLeft = 0; break;
			case "ArrowRight": moveState.yawRight = 0; break;

			case "ArrowUp": moveState.pitchUp = 0; break;
			case "ArrowDown": moveState.pitchDown = 0; break;

			case "KeyQ": moveState.rollLeft = 0; break;
			case "KeyE": moveState.rollRight = 0; break;
		}

		updateMovementVector();
		updateRotationVector();
	}

	const _getDomElement = () => domElement;

	const hasPointerLock = () => document.pointerLockElement === domElement;

	const onPointerDown = (event: PointerEvent) => {
		domElement.requestPointerLock();

		// if (enabled === false)
		// 	return;

		// if (event.button == 2)
		// 	object.rotation.set(0, 0, 0);

		// if(dragToLook) {
		// 	_status++;
		// } else {
		// 	switch(event.button) {
		// 		case 0: moveState.forward = 1; break;
		// 		case 2: moveState.back = 1; break;
		// 	}

		// 	updateMovementVector();
		// }
	}

	const getContainerDimensions = () => {
		const domElement = _getDomElement();

		if (domElement !== document as any) {
			return {
				size: [domElement.offsetWidth, domElement.offsetHeight],
				offset: [domElement.offsetLeft, domElement.offsetTop]
			};
		} else {
			return {
				size: [window.innerWidth, window.innerHeight],
				offset: [0, 0]
			};
		}
	}

	const moveTheta = (value: number) => {
		const newTheta = theta + value;
		theta = newTheta % r360;
	};

	const movePhi = (value: number) => {
		const newPhi = phi + value;
		phi = clamp(newPhi, 0, r180);
	};

	const onPointerMove = (event: PointerEvent) => {
		if(!hasPointerLock())
			return

		moveTheta(event.movementX * (-Math.PI / 1000));
		movePhi(event.movementY * (-Math.PI / 1000));
	}

	const onPointerUp = (event: PointerEvent) => {
		if (!enabled)
			return;

		if (dragToLook) {
			_status--;
			moveState.yawLeft = moveState.pitchDown = 0;
		} else {
			switch (event.button) {
				case 0: moveState.forward = 0; break;
				case 2: moveState.back = 0; break;
			}

			updateMovementVector();
		}

		updateRotationVector();
	}

	const onPointerCancel = () => {
		if (!enabled)
			return;

		if (dragToLook) {
			_status = 0;
			moveState.yawLeft = moveState.pitchDown = 0;
		} else {
			moveState.forward = 0;
			moveState.back = 0;

			updateMovementVector();
		}

		updateRotationVector();
	}

	const onContextMenu = (event: MouseEvent) => {
		if (!enabled)
			return;

		event.preventDefault();
	}

	const connect = () => {
		window.addEventListener("keydown", onKeyDown);
		window.addEventListener("keyup", onKeyUp);

		const domElement = _getDomElement();
		domElement.addEventListener("pointermove", onPointerMove);
		domElement.addEventListener("pointerdown", onPointerDown);
		domElement.addEventListener("pointerup", onPointerUp);
		domElement.addEventListener("pointercancel", onPointerCancel);
		domElement.addEventListener("contextmenu", onContextMenu);
	}

	const disconnect = () => {
		window.removeEventListener("keydown", onKeyDown);
		window.removeEventListener("keyup", onKeyUp);

		const domElement = _getDomElement();
		domElement.removeEventListener("pointermove", onPointerMove);
		domElement.removeEventListener("pointerdown", onPointerDown);
		domElement.removeEventListener("pointerup", onPointerUp);
		domElement.removeEventListener("pointercancel", onPointerCancel);
		domElement.removeEventListener("contextmenu", onContextMenu);
	}

	const dispose = disconnect;

	const eularRotation = new Vector3();

	const update = (delta: number) => {
		if (!enabled)
			return;

		const moveMult = delta * movementSpeed * movementSpeedMultiplier;
		// const rotMult = delta * rollSpeed * movementSpeedMultiplier;
		const rotMult = delta * rollSpeed;

		object.translateX(_moveVector.x * moveMult);
		object.translateY(_moveVector.y * moveMult);
		object.translateZ(_moveVector.z * moveMult);

		moveTheta(_rotationVector.y * 0.01);
		movePhi(_rotationVector.x * 0.01);

		// Rotation
		eularRotation.set(phi - r90, theta, 0);
		object.rotation.setFromVector3(eularRotation, "ZYX");

		if (
			_lastPosition.distanceToSquared(object.position) > EPS ||
			8 * (1 - _lastQuaternion.dot(object.quaternion)) > EPS
		) {
			// TODO: Restore this
			// dispatchEvent(changeEvent);
			_lastQuaternion.copy(object.quaternion);
			_lastPosition.copy(object.position);
		}
	}

	if (domElement !== null)
		connect();

	return {
		connect,
		disconnect,
		dispose,
		update,
	};
}
