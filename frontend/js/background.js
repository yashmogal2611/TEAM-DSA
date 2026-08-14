/**
 * Dynamic Moving Background Engine — Cool Tech & Deep Navy Edition
 * ApexLoans - Deep Navy (#071A2B), Navy Blue (#0B3154), Electric Blue (#1677FF) & Gold (#D4AF37)
 */

(function () {
  'use strict';

  let canvas, ctx;
  let width, height;
  let orbs = [];
  let particles = [];
  let mouse = { x: null, y: null, radius: 200 };

  const ORB_COUNT = 6;
  const PARTICLE_COUNT = 45;

  // Cool Deep Navy, Electric Blue & Subtle Gold Aesthetic
  const ORB_COLORS = [
    { r: 22, g: 119, b: 255, a: 0.12 }, // Electric Blue
    { r: 11, g: 49, b: 84, a: 0.15 },   // Navy Blue
    { r: 7, g: 26, b: 43, a: 0.08 },    // Deep Navy
    { r: 147, g: 197, b: 253, a: 0.10 }, // Soft Sky Blue
    { r: 212, g: 175, b: 55, a: 0.06 },  // Subtle Gold Glow
    { r: 16, g: 185, b: 129, a: 0.05 }   // Emerald Fintech Glow
  ];

  class FluidOrb {
    constructor(index) {
      this.index = index;
      this.init();
    }

    init() {
      this.x = Math.random() * width;
      this.y = Math.random() * height;
      this.radius = Math.random() * 220 + 140;
      this.color = ORB_COLORS[this.index % ORB_COLORS.length];
      this.vx = (Math.random() - 0.5) * 0.4;
      this.vy = (Math.random() - 0.5) * 0.4;
      this.angle = Math.random() * Math.PI * 2;
      this.angleSpeed = 0.006 + Math.random() * 0.008;
      this.originalRadius = this.radius;
    }

    update() {
      this.angle += this.angleSpeed;
      this.x += this.vx + Math.sin(this.angle * 0.7) * 0.5;
      this.y += this.vy + Math.cos(this.angle * 0.5) * 0.5;

      if (this.x - this.radius < -100) this.vx = Math.abs(this.vx);
      if (this.x + this.radius > width + 100) this.vx = -Math.abs(this.vx);
      if (this.y - this.radius < -100) this.vy = Math.abs(this.vy);
      if (this.y + this.radius > height + 100) this.vy = -Math.abs(this.vy);

      this.radius = this.originalRadius + Math.sin(this.angle * 1.1) * 25;

      if (mouse.x !== null && mouse.y !== null) {
        const dx = mouse.x - this.x;
        const dy = mouse.y - this.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < mouse.radius + this.radius) {
          const force = (mouse.radius + this.radius - dist) / (mouse.radius + this.radius);
          this.x -= (dx / dist) * force * 1.5;
          this.y -= (dy / dist) * force * 1.5;
        }
      }
    }

    draw() {
      ctx.save();
      const gradient = ctx.createRadialGradient(
        this.x, this.y, 0,
        this.x, this.y, this.radius
      );
      const c = this.color;
      gradient.addColorStop(0, `rgba(${c.r}, ${c.g}, ${c.b}, ${c.a})`);
      gradient.addColorStop(0.5, `rgba(${c.r}, ${c.g}, ${c.b}, ${c.a * 0.4})`);
      gradient.addColorStop(1, `rgba(${c.r}, ${c.g}, ${c.b}, 0)`);

      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  class TechParticle {
    constructor() {
      this.init();
    }

    init() {
      this.x = Math.random() * width;
      this.y = Math.random() * height;
      this.size = Math.random() * 1.8 + 0.8;
      this.vx = (Math.random() - 0.5) * 0.35;
      this.vy = (Math.random() - 0.5) * 0.35;
      this.alpha = Math.random() * 0.25 + 0.1;
    }

    update() {
      this.x += this.vx;
      this.y += this.vy;

      if (this.x < 0 || this.x > width) this.vx *= -1;
      if (this.y < 0 || this.y > height) this.vy *= -1;
    }

    draw() {
      ctx.fillStyle = `rgba(11, 49, 84, ${this.alpha})`;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function resize() {
    width = canvas.width = window.innerWidth;
    height = canvas.height = window.innerHeight;
  }

  function init() {
    canvas = document.getElementById('bgCanvas');
    if (!canvas) return;
    ctx = canvas.getContext('2d');
    resize();

    orbs = [];
    for (let i = 0; i < ORB_COUNT; i++) {
      orbs.push(new FluidOrb(i));
    }

    particles = [];
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      particles.push(new TechParticle());
    }

    window.addEventListener('resize', resize);
    window.addEventListener('mousemove', (e) => {
      mouse.x = e.clientX;
      mouse.y = e.clientY;
    });
    window.addEventListener('mouseleave', () => {
      mouse.x = null;
      mouse.y = null;
    });

    animate();
  }

  function drawConnections() {
    for (let i = 0; i < particles.length; i++) {
      for (let j = i + 1; j < particles.length; j++) {
        const dx = particles[i].x - particles[j].x;
        const dy = particles[i].y - particles[j].y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < 110) {
          ctx.strokeStyle = `rgba(22, 119, 255, ${0.08 * (1 - dist / 110)})`;
          ctx.lineWidth = 0.6;
          ctx.beginPath();
          ctx.moveTo(particles[i].x, particles[i].y);
          ctx.lineTo(particles[j].x, particles[j].y);
          ctx.stroke();
        }
      }
    }
  }

  function animate() {
    ctx.clearRect(0, 0, width, height);

    orbs.forEach(orb => {
      orb.update();
      orb.draw();
    });

    particles.forEach(p => {
      p.update();
      p.draw();
    });

    drawConnections();

    requestAnimationFrame(animate);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
