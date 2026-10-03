document.addEventListener("DOMContentLoaded", () => {
    // Плавное появление блока
    const glass = document.getElementById("glass");
    setTimeout(() => {
      glass.style.opacity = "1";
      glass.style.transform = "translateY(0)";
    }, 300);
  
    // Приветствие по времени суток
    const now = new Date().getHours();
    let greeting = "Добро пожаловать";
    if (now >= 6 && now < 12) greeting = "Доброе утро";
    else if (now >= 12 && now < 18) greeting = "Добрый день";
    else if (now >= 18 && now < 22) greeting = "Добрый вечер";
    else greeting = "Доброй ночи";
  
    const h2 = glass.querySelector("h2");
    h2.textContent = `${greeting} в Аниме мир!`;
  });

