# 📄 PDF to Flowchart Converter

> A completely client-side web application that instantly transforms text-heavy PDF documents into structured, interactive flowcharts without requiring any external API keys or server processing.

## ✨ Key Features
* **Zero API Keys Required:** Operates entirely without paid AI APIs like OpenAI or Claude.
* **100% Client-Side Processing:** All text extraction and diagram generation happens locally within your browser, ensuring complete privacy. 
* **Aesthetic UI/UX:** Features a premium, modern dark theme combining deep blacks and neon blue accents with glassmorphism effects.
* **Intelligent Parsing:** Uses heuristics to convert headings, bullet points, and paragraphs into logical flowchart nodes.
* **Drag-and-Drop Interface:** Seamless and intuitive file uploading experience.
* **Responsive Canvas:** A dedicated split-screen view to inspect and interact with the generated flowcharts.

## 🛠️ Technology Stack
* **Frontend:** HTML5, CSS3, Vanilla JavaScript
* **Styling:** Tailwind CSS (via CDN) / Custom CSS
* **PDF Processing:** [pdf.js](https://mozilla.github.io/pdf.js/) for local document reading.
* **Diagram Rendering:** [Mermaid.js](https://mermaid.js.org/) for rendering the flowchart syntax.
* **Icons:** FontAwesome for UI elements and social links.

## 🚀 Getting Started

### Prerequisites
* A modern web browser (Google Chrome, Mozilla Firefox, Safari, Edge).
* No Node.js, npm, or backend server configuration is required.

### Installation & Usage
1. **Clone the repository:**
   ```bash
   git clone https://github.com/Sohan010-dev/pdf-to-flowchart.git
   ```
2. **Navigate to the project directory:**
   ```bash
   cd pdf-to-flowchart
   ```
3. **Launch the application:**
   * Simply double-click the `index.html` file to open it in your browser.
   * *Optional:* Use an extension like Live Server in VS Code for hot-reloading during development.
4. **Generate a Flowchart:**
   * Upload a text-based PDF using the drag-and-drop zone.
   * Wait a few seconds for the text extraction and syntax mapping.
   * View the generated flowchart on the right-side canvas.

## 🤝 Connect with the Developer

Built and maintained by **Sohan Banerjee**. 

* **GitHub:** [@Sohan010-dev](https://github.com/Sohan010-dev)
* **LinkedIn:** [Sohan Banerjee](https://www.linkedin.com/in/sohanbanerjee-offcl/)

## 📝 License
* This project is open-source and available under the [MIT License](LICENSE).
