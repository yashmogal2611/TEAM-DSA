/**
 * Dynamic Moving Background Attractions Engine — Lively & Organic Edition
 * ApexLoans - Warm Cashmere & Gold Fluid Metaballs, Starburst Dust & Mouse Aura
 */

(function () {
  'use strict';

  let canvas, ctx;
  let width, height;
  let orbs = [];
  let particles = [];
  let sparkles = [];
  let mouse = { x: null, y: null, targetX: null, targetY: null, radius: 220 };
  let time = 0;

  const ORB_COUNT = 8;
  const PARTICLE_COUNT = 50;
  const SPARKLE_COUNT = 30;

  // Soft Subtle Pastel Palette for Fluid Orbs
  const ORB_COLORS = [
    { r: 242, g: 232, b: 218, a: 0.35 }, // Soft Cashmere Sand
    { r: 232, g: 203, b: 175, a: 0.25 }, // Champagne Gold
    { r: 248, g: 240, b: 230, a: 0.40 }, // Cream Alabaster
    { r: 228, g: 189, b: 159, a: 0.20 }, // Brushed Amber
    { r: 238, g: 220, b: 200, a: 0.30 }, // Radiant Oatmeal
    { r: 250, g: 244, b: 236, a: 0.45 }, // Luminous Pearl
    { r: 238, g: 205, b: 172, a: 0.22 }, // Warm Honey Glow
    { r: 244, g: 230, b: 216, a: 0.32 }  // Cashmere Sandstone
  ];

  class FluidOrb {
    constructor(index) {
      this.index = index;
      this.init();
    }

    init() {
      this.x = Math.random() * width;
      this.y = Math.random() * height;
      this.radius = Math.random() * 190 + 130;
      this.color = ORB_COLORS[this.index % ORB_COLORS.length];
      this.vx = (Math.random() - 0.5) * 0.5;
      this.vy = (Math.random() - 0.5) * 0.5;
      this.angle = Math.random() * Math.PI * 2;
      this.angleSpeed = 0.008 + Math.random() * 0.012;
      this.originalRadius = this.radius;
    }

    update() {
      this.angle += this.angleSpeed;
      
      // Morphing sine wave orbital float
      this.x += this.vx + Math.sin(this.angle * 0.8) * 0.7;
      this.y += this.vy + Math.cos(this.angle * 0.6) * 0.7;

      // Soft boundary bouncing
      if (this.x - this.radius < -120) this.vx = Math.abs(this.vx);
      if (this.x + this.radius > width + 120) this.vx = -Math.abs(this.vx);
      if (this.y - this.radius < -120) this.vy = Math.abs(this.vy);
      if (this.y + this.radius > height + 120) this.vy = -Math.abs(this.vy);

      // Breathing pulsing scale
      this.radius = this.originalRadius + Math.sin(this.angle * 1.2) * 30;

      // Interactive mouse attraction / deflection
      if (mouse.x !== null && mouse.y !== null) {
        const dx = mouse.x - this.x;
        const dy = mouse.y - this.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < mouse.radius + this.radius) {
          const force = (mouse.radius + this.radius - dist) / (mouse.radius + this.radius);
          this.x -= (dx / dist) * force * 1.8;
          this.y -= (dy / dist) * force * 1.8;
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
      gradient.addColorStop(0.5, `rgba(${c.r}, ${c.g}, ${c.b}, ${c.a * 0.45})`);
      gradient.addColorStop(1, `rgba(${c.r}, ${c.g}, ${c.b}, 0)`);

      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  class Sparkle {
    constructor() {
      this.reset();
    }

    reset() {
      this.x = Math.random() * width;
      this.y = Math.random() * height;
      this.size = Math.random() * 2 + 0.8;
      this.alpha = Math.random() * 0.8 + 0.2;
      this.twinkleSpeed = Math.random() * 0.03 + 0.01;
      this.angle = Math.random() * Math.PI * 2;
    }

    update() {
      this.angle += this.twinkleSpeed;
      this.alpha = (Math.sin(this.angle) + 1) / 2 * 0.8 + 0.2;
    }

    draw() {
      ctx.save();
      ctx.fillStyle = `rgba(212, 163, 115, ${this.alpha})`;
      ctx.shadowColor = 'rgba(212, 163, 115, 0.6)';
      ctx.shadowBlur = 6;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  class ConnectedParticle {
    constructor() {
      this.reset();
    }

    reset() {
      this.x = Math.random() * width;
      this.y = Math.random() * height;
      this.size = Math.random() * 2.2 + 1;
      this.speedX = (Math.random() - 0.5) * 0.6;
      this.speedY = (Math.random() - 0.5) * 0.6;
      this.alpha = Math.random() * 0.5 + 0.3;
    }

    update() {
      this.x += this.speedX;
      this.y += this.speedY;

      if (this.x < 0 || this.x > width || this.y < 0 || this.y > height) {
        this.reset();
      }
    }

    draw() {
      ctx.fillStyle = `rgba(198, 160, 130, ${this.alpha})`;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawMouseAura() {
    if (mouse.x === null || mouse.y === null) return;
    ctx.save();
    const auraGradient = ctx.createRadialGradient(
      mouse.x, mouse.y, 0,
      mouse.x, mouse.y, 160
    );
    auraGradient.addColorStop(0, 'rgba(212, 163, 115, 0.25)');
    auraGradient.addColorStop(0.5, 'rgba(232, 218, 198, 0.12)');
    auraGradient.addColorStop(1, 'rgba(245, 238, 228, 0)');

    ctx.fillStyle = auraGradient;
    ctx.beginPath();
    ctx.arc(mouse.x, mouse.y, 160, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawFlowingRibbon() {
    time += 0.006;
    ctx.save();
    ctx.strokeStyle = 'rgba(212, 163, 115, 0.08)';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    
    for (let x = 0; x < width; x += 30) {
      const y = height * 0.5 + Math.sin(x * 0.003 + time) * 60 + Math.cos(x * 0.002 + time * 1.2) * 30;
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.restore();
  }

  function connectParticles() {
    for (let i = 0; i < particles.length; i++) {
      for (let j = i + 1; j < particles.length; j++) {
        const dx = particles[i].x - particles[j].x;
        const dy = particles[i].y - particles[j].y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < 125) {
          const alpha = (1 - dist / 125) * 0.18;
          ctx.strokeStyle = `rgba(210, 185, 160, ${alpha})`;
          ctx.lineWidth = 0.9;
          ctx.beginPath();
          ctx.moveTo(particles[i].x, particles[i].y);
          ctx.lineTo(particles[j].x, particles[j].y);
          ctx.stroke();
        }
      }
    }
  }

  function resize() {
    width = canvas.width = window.innerWidth;
    height = canvas.height = window.innerHeight;
  }

  function animate() {
    ctx.clearRect(0, 0, width, height);

    if (mouse.targetX !== null) {
      mouse.x += (mouse.targetX - mouse.x) * 0.08;
      mouse.y += (mouse.targetY - mouse.y) * 0.08;
    }

    drawMouseAura();
    drawFlowingRibbon();

    orbs.forEach(orb => {
      orb.update();
      orb.draw();
    });

    particles.forEach(p => {
      p.update();
      p.draw();
    });
    connectParticles();

    sparkles.forEach(s => {
      s.update();
      s.draw();
    });

    requestAnimationFrame(animate);
  }

  function init() {
    canvas = document.getElementById('bgCanvas');
    if (!canvas) return;
    ctx = canvas.getContext('2d');

    resize();
    window.addEventListener('resize', resize);

    window.addEventListener('mousemove', (e) => {
      mouse.targetX = e.clientX;
      mouse.targetY = e.clientY;
    });

    window.addEventListener('mouseleave', () => {
      mouse.targetX = null;
      mouse.targetY = null;
      mouse.x = null;
      mouse.y = null;
    });

    for (let i = 0; i < ORB_COUNT; i++) {
      orbs.push(new FluidOrb(i));
    }

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      particles.push(new ConnectedParticle());
    }

    for (let i = 0; i < SPARKLE_COUNT; i++) {
      sparkles.push(new Sparkle());
    }

    animate();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
