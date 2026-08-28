# =============================================================================
# Silver HYROX — Analytics Dashboard (R Shiny)
# -----------------------------------------------------------------------------
# Live data source : Google Sheet (18 exported fields, README §4a) read on the
#                    fly via the gviz CSV endpoint (README §10 Method A / §11).
# Built on the supplied ShinyTemplate.R (X/Y/Z scatter + brush -> DT table),
# extended with a hover tooltip, selection statistics, and five analytical tabs.
#
# Run:
#   install.packages(c("shiny","ggplot2","dplyr","DT","shinythemes","readr","tools"))
#   shiny::runApp("app.R")     # or open in RStudio and click "Run App"
#
# The Sheet must be shared "Anyone with the link can view" for the gviz endpoint
# to work without authentication. If it is private, swap load_data() for a
# googlesheets4::read_sheet() call (README §10 Method B).
# =============================================================================

# ---- Packages ---------------------------------------------------------------
library(shiny)
library(ggplot2)
library(dplyr)
library(DT)
library(shinythemes)
library(readr)
library(tools)

# ---- Constants --------------------------------------------------------------
SHEET_ID  <- "1P-09DEozBacsb7OGXcxDaReKPsnWeIlWjnaUUzjlMvE"
SHEET_CSV <- sprintf(
  "https://docs.google.com/spreadsheets/d/%s/gviz/tq?tqx=out:csv", SHEET_ID
)
REFRESH_MS <- 60000  # auto-refresh cadence (README §11 used 60 s)

# Field metadata: single source of truth for dropdown choices + axis labels.
# CONT = continuous (numeric) fields eligible for X / Y.
CONT <- c(
  age           = "Age (years)",
  totalScore    = "Total score (reps)",
  stsReps       = "Sit-to-Stand reps",
  rowReps       = "Seated Row reps",
  stsAvgRepTime = "STS avg rep time (s)",
  rowAvgRepTime = "Row avg rep time (s)",
  stsFastestRep = "STS fastest rep (s)",
  stsSlowestRep = "STS slowest rep (s)",
  rowFastestRep = "Row fastest rep (s)",
  rowSlowestRep = "Row slowest rep (s)",
  stsElapsed    = "STS elapsed (s)",
  rowElapsed    = "Row elapsed (s)",
  rowAvgReach   = "Row avg reach (ratio)"
)
# CAT = categorical fields eligible for colour / fill / grouping.
CAT <- c(
  gender         = "Gender",
  age_group      = "Age group",
  stsConsistency = "STS consistency",
  rowConsistency = "Row consistency"
)

# selectInput() choice vectors: names shown to user, values are column names.
cont_choices <- setNames(names(CONT), unname(CONT))
cat_choices  <- setNames(names(CAT),  unname(CAT))

cont_label <- function(k) if (!is.null(k) && k %in% names(CONT)) unname(CONT[k]) else k
cat_label  <- function(k) if (!is.null(k) && k %in% names(CAT))  unname(CAT[k])  else k

`%||%` <- function(a, b) if (is.null(a) || length(a) == 0) b else a

fmt <- function(x) {
  if (length(x) == 0 || is.na(x)) return("NA")
  if (is.numeric(x)) format(round(x, 2), nsmall = 0, trim = TRUE) else as.character(x)
}
fmt_p <- function(p) if (is.na(p)) "NA" else if (p < 0.001) "<0.001" else formatC(p, digits = 3, format = "f")

# ---- Data loading & cleaning ------------------------------------------------
# All 18 fields per README §4a. String metrics arrive as text -> coerce.
NUM_FIELDS <- c("age", "totalScore", "stsReps", "rowReps",
                "stsElapsed", "stsAvgRepTime", "stsFastestRep", "stsSlowestRep",
                "rowElapsed", "rowAvgRepTime", "rowFastestRep", "rowSlowestRep",
                "rowAvgReach")
ALL_FIELDS <- c("timestamp", "nickname", "gender", "age", "totalScore",
                "stsReps", "stsElapsed", "stsAvgRepTime", "stsFastestRep",
                "stsSlowestRep", "stsConsistency", "rowReps", "rowElapsed",
                "rowAvgRepTime", "rowFastestRep", "rowSlowestRep",
                "rowConsistency", "rowAvgReach")
CONS_LEVELS <- c("Excellent", "Good", "Variable", "N/A")

clean_silver <- function(df) {
  df <- as.data.frame(df, stringsAsFactors = FALSE, check.names = FALSE)
  # Ensure every expected column exists (empty sheet / partial headers).
  for (f in ALL_FIELDS) if (!f %in% names(df)) df[[f]] <- NA

  # Coerce numeric-string metrics.
  for (f in NUM_FIELDS) df[[f]] <- suppressWarnings(as.numeric(as.character(df[[f]])))

  # Timestamp -> POSIXct (ISO 8601, e.g. 2025-01-01T09:15:00.000Z).
  ts <- as.character(df$timestamp)
  ts <- sub("Z$", "", ts); ts <- sub("\\.\\d+$", "", ts); ts <- sub("T", " ", ts)
  df$timestamp_parsed <- suppressWarnings(as.POSIXct(ts, tz = "UTC"))

  # Categoricals -> factors (blank -> NA).
  df$nickname <- as.character(df$nickname)
  g <- as.character(df$gender); g[g == "" | is.na(g)] <- NA
  df$gender <- factor(g)
  df$stsConsistency <- factor(as.character(df$stsConsistency), levels = CONS_LEVELS)
  df$rowConsistency <- factor(as.character(df$rowConsistency), levels = CONS_LEVELS)

  # Derived age group (README §8.2 uses age groups derived from `age`).
  df$age_group <- cut(df$age,
                      breaks = c(-Inf, 49, 59, 69, 79, Inf),
                      labels = c("<50", "50-59", "60-69", "70-79", "80+"))
  df$age_group <- factor(ifelse(is.na(df$age_group), "Unknown", as.character(df$age_group)),
                         levels = c("<50", "50-59", "60-69", "70-79", "80+", "Unknown"))

  # Derived data-quality / analysis helpers (README §8.3, §16).
  df$sts_share <- ifelse(df$totalScore > 0, df$stsReps / df$totalScore, NA)
  df$row_share <- ifelse(df$totalScore > 0, df$rowReps / df$totalScore, NA)
  df
}

load_data <- function() {
  raw <- tryCatch(
    readr::read_csv(SHEET_CSV, show_col_types = FALSE, progress = FALSE),
    error = function(e) tryCatch(utils::read.csv(SHEET_CSV, check.names = FALSE),
                                 error = function(e2) NULL)
  )
  if (is.null(raw)) return(NULL)
  clean_silver(raw)
}

# =============================================================================
# UI
# =============================================================================
ui <- fluidPage(
  theme = shinytheme("flatly"),
  tags$head(tags$style(HTML("
    .hovertip{position:absolute;z-index:1000;background:rgba(255,255,255,.95);
      border:1px solid #bbb;border-radius:4px;padding:6px 8px;font-size:12px;
      pointer-events:none;box-shadow:0 1px 4px rgba(0,0,0,.2);max-width:220px;}
    .metric{background:#f7f9fa;border:1px solid #e3e8ea;border-radius:6px;
      padding:10px 12px;text-align:center;}
    .metric .num{font-size:22px;font-weight:600;color:#2c3e50;}
    .metric .lab{font-size:12px;color:#7b8a8b;}
  "))),
  titlePanel("Silver HYROX — Analytics Dashboard"),

  sidebarLayout(
    sidebarPanel(
      width = 3,
      actionButton("refresh_btn", "Refresh data now", class = "btn-primary btn-sm"),
      div(style = "margin-top:6px;font-size:12px;color:#7b8a8b;", textOutput("status")),
      hr(),
      strong("Global filters"),
      uiOutput("gender_filter"),
      sliderInput("f_age", "Age range:", min = 0, max = 100, value = c(0, 100), step = 1),
      hr(),

      # ---- Explorer controls ----
      conditionalPanel(
        "input.main_tabs == 'Explorer'",
        selectInput("x", "X-axis (continuous):", choices = cont_choices, selected = "age"),
        selectInput("y", "Y-axis (continuous):", choices = cont_choices, selected = "totalScore"),
        selectInput("z", "Colour by (categorical):", choices = cat_choices, selected = "gender"),
        checkboxInput("add_smooth", "Add linear trend line", value = TRUE),
        sliderInput("alpha", "Point opacity:", min = 0.1, max = 1, value = 0.7, step = 0.05),
        sliderInput("size",  "Point size:",    min = 1,   max = 8, value = 3,   step = 0.5),
        textInput("plot_title", "Plot title (optional):", placeholder = "auto"),
        actionButton("update_plot_title", "Update title", class = "btn-sm")
      ),
      # ---- Distributions controls ----
      conditionalPanel(
        "input.main_tabs == 'Distributions'",
        selectInput("d_var", "Variable:", choices = cont_choices, selected = "totalScore"),
        selectInput("d_fill", "Split / fill by:",
                    choices = c("None" = "None", cat_choices), selected = "None"),
        radioButtons("d_type", "Type:", choices = c("Histogram", "Density"), inline = TRUE),
        sliderInput("d_bins", "Histogram bins:", min = 5, max = 50, value = 20, step = 1)
      ),
      # ---- Group comparison controls ----
      conditionalPanel(
        "input.main_tabs == 'Group comparison'",
        selectInput("g_y", "Outcome (continuous):", choices = cont_choices, selected = "totalScore"),
        selectInput("g_x", "Group (categorical):", choices = cat_choices, selected = "gender"),
        radioButtons("g_type", "Plot:", choices = c("Boxplot", "Violin"), inline = TRUE),
        checkboxInput("g_jitter", "Show individual points", value = TRUE)
      ),
      # ---- Station comparison controls ----
      conditionalPanel(
        "input.main_tabs == 'Station comparison'",
        selectInput("s_colour", "Colour by:", choices = cat_choices, selected = "gender"),
        helpText("Raw STS and Row counts are on different scales (README \u00a78.3/\u00a715); ",
                 "this tab standardises each station (within-sample z-scores) before comparing.")
      ),
      # ---- Correlation controls ----
      conditionalPanel(
        "input.main_tabs == 'Correlations'",
        radioButtons("c_method", "Method:", choices = c("Spearman", "Pearson"), inline = TRUE),
        checkboxGroupInput("c_vars", "Variables:",
                           choices = cont_choices,
                           selected = c("age", "totalScore", "stsReps", "rowReps",
                                        "stsAvgRepTime", "rowAvgRepTime", "rowAvgReach"))
      ),
      # ---- Leaderboard controls ----
      conditionalPanel(
        "input.main_tabs == 'Leaderboard & data'",
        sliderInput("top_n", "Leaderboard size:", min = 5, max = 50, value = 15, step = 5)
      )
    ),

    mainPanel(
      width = 9,
      tabsetPanel(
        id = "main_tabs",

        # ---- OVERVIEW ----
        tabPanel(
          "Overview",
          br(),
          uiOutput("metric_row"),
          br(),
          fluidRow(
            column(6, plotOutput("ov_score", height = 260)),
            column(6, plotOutput("ov_age",   height = 260))
          ),
          br(),
          h4("Data-quality flags"),
          tableOutput("dq_table"),
          helpText("Flags follow README \u00a716: missing stations, likely manual stops ",
                   "(elapsed < 30 s), and duplicate submissions (same nickname within 2 min). ",
                   "These are indicators for cleaning, not errors.")
        ),

        # ---- EXPLORER (main requested tab) ----
        tabPanel(
          "Explorer",
          br(),
          div(style = "position:relative;",
              plotOutput("scatter", height = 460,
                         brush = brushOpts(id = "plot_brush"),
                         hover = hoverOpts(id = "plot_hover", delay = 80, delayType = "debounce")),
              uiOutput("hover_info")
          ),
          helpText("Drag a box on the plot to select points; hover a point for a quick tooltip."),
          fluidRow(
            column(7,
                   h4("Selected points"),
                   DT::dataTableOutput("sel_table")),
            column(5,
                   h4("Statistics"),
                   textOutput("sel_scope"),
                   tableOutput("sel_desc"),
                   uiOutput("sel_corr"))
          )
        ),

        # ---- DISTRIBUTIONS ----
        tabPanel(
          "Distributions",
          br(),
          plotOutput("dist_plot", height = 420),
          h4("Isolated plot data"),
          helpText("Extracted from the ggplot object via ggplot_build(): bin centre, ",
                   "count and density (histogram) or sampled density curve."),
          DT::dataTableOutput("dist_data")
        ),

        # ---- GROUP COMPARISON ----
        tabPanel(
          "Group comparison",
          br(),
          plotOutput("group_plot", height = 420),
          fluidRow(
            column(6,
                   h4("Group summaries (boxplot statistics)"),
                   tableOutput("group_stats")),
            column(6,
                   h4("Significance test"),
                   verbatimTextOutput("group_test"))
          )
        ),

        # ---- STATION COMPARISON ----
        tabPanel(
          "Station comparison",
          br(),
          plotOutput("station_plot", height = 420),
          h4("Standardised station values"),
          helpText("z-scores are computed within the currently filtered sample. ",
                   "Points above the diagonal did relatively better at Seated Row than ",
                   "Sit-to-Stand (and vice versa)."),
          DT::dataTableOutput("station_data")
        ),

        # ---- CORRELATIONS ----
        tabPanel(
          "Correlations",
          br(),
          plotOutput("corr_plot", height = 460),
          h4("Correlation matrix (long form)"),
          DT::dataTableOutput("corr_data")
        ),

        # ---- LEADERBOARD & DATA ----
        tabPanel(
          "Leaderboard & data",
          br(),
          h4("Leaderboard (top total scores)"),
          DT::dataTableOutput("leaderboard"),
          br(),
          h4("Full live dataset (filterable)"),
          DT::dataTableOutput("full_table")
        )
      )
    )
  )
)

# =============================================================================
# SERVER
# =============================================================================
server <- function(input, output, session) {

  # ---- Live data: manual button + 60 s auto-refresh --------------------------
  refresh <- reactiveVal(Sys.time())
  observeEvent(input$refresh_btn, refresh(Sys.time()))

  data_live <- reactive({
    refresh()                          # depend on manual refresh
    invalidateLater(REFRESH_MS, session)  # and auto-refresh
    load_data()
  })

  req_data <- reactive({
    d <- data_live()
    validate(
      need(!is.null(d), "Could not read the Google Sheet. Check the sharing setting or your connection."),
      need(nrow(d) > 0, "The sheet has no result rows yet.")
    )
    d
  })

  output$status <- renderText({
    d <- data_live()
    if (is.null(d)) return("Data source unreachable.")
    sprintf("%d rows loaded \u00b7 updated %s", nrow(d), format(Sys.time(), "%H:%M:%S"))
  })

  # ---- Global filters --------------------------------------------------------
  prev_levels <- reactiveVal(NULL)
  age_init    <- reactiveVal(FALSE)

  output$gender_filter <- renderUI({
    d <- data_live()
    lv <- if (is.null(d)) character(0) else levels(droplevels(d$gender))
    sel <- isolate(input$f_gender)               # preserve choice across refreshes
    sel <- if (is.null(sel)) lv else intersect(sel, lv)
    checkboxGroupInput("f_gender", "Gender:", choices = lv, selected = sel)
  })

  observeEvent(data_live(), {
    d <- data_live(); if (is.null(d) || !nrow(d)) return()
    if (!isTRUE(age_init()) && any(is.finite(d$age))) {
      lo <- floor(min(d$age, na.rm = TRUE)); hi <- ceiling(max(d$age, na.rm = TRUE))
      updateSliderInput(session, "f_age", min = lo, max = hi, value = c(lo, hi))
      age_init(TRUE)
    }
  }, ignoreNULL = TRUE)

  df_filt <- reactive({
    d <- req_data()
    if (!is.null(input$f_gender) && length(input$f_gender))
      d <- d[as.character(d$gender) %in% input$f_gender | is.na(d$gender), , drop = FALSE]
    if (!is.null(input$f_age))
      d <- d[is.na(d$age) | (d$age >= input$f_age[1] & d$age <= input$f_age[2]), , drop = FALSE]
    d
  })

  # ==========================================================================
  # OVERVIEW
  # ==========================================================================
  output$metric_row <- renderUI({
    d <- df_filt()
    box <- function(num, lab) column(2, div(class = "metric",
                                            div(class = "num", num),
                                            div(class = "lab", lab)))
    fluidRow(
      box(nrow(d), "Sessions"),
      box(length(unique(d$nickname)), "Unique nicknames"),
      box(fmt(mean(d$totalScore, na.rm = TRUE)), "Mean total score"),
      box(fmt(mean(d$stsReps, na.rm = TRUE)), "Mean STS reps"),
      box(fmt(mean(d$rowReps, na.rm = TRUE)), "Mean Row reps"),
      box(fmt(median(d$age, na.rm = TRUE)), "Median age")
    )
  })

  output$ov_score <- renderPlot({
    d <- df_filt(); validate(need(nrow(d) > 0, ""))
    ggplot(d, aes(x = totalScore)) +
      geom_histogram(bins = 20, fill = "#2c7fb8", colour = "white") +
      labs(title = "Total score distribution", x = cont_label("totalScore"), y = "Count") +
      theme_minimal(base_size = 13)
  })
  output$ov_age <- renderPlot({
    d <- df_filt(); validate(need(any(is.finite(d$age)), "No age data."))
    ggplot(d, aes(x = age)) +
      geom_histogram(bins = 20, fill = "#41ab5d", colour = "white") +
      labs(title = "Age distribution", x = cont_label("age"), y = "Count") +
      theme_minimal(base_size = 13)
  })

  output$dq_table <- renderTable({
    d <- df_filt()
    dup <- 0L
    if (nrow(d) > 1) {
      o <- order(d$nickname, d$timestamp_parsed)
      s <- d[o, ]
      same <- s$nickname[-1] == s$nickname[-nrow(s)]
      dt <- as.numeric(difftime(s$timestamp_parsed[-1], s$timestamp_parsed[-nrow(s)], units = "mins"))
      dup <- sum(same & !is.na(dt) & abs(dt) <= 2)
    }
    data.frame(
      Flag = c("Missing / skipped Sit-to-Stand (reps = 0 or NA)",
               "Missing / skipped Seated Row (reps = 0 or NA)",
               "Likely manual stop \u2014 STS elapsed < 30 s",
               "Likely manual stop \u2014 Row elapsed < 30 s",
               "Duplicate submissions (same nickname \u2264 2 min apart)"),
      Count = c(sum(is.na(d$stsReps) | d$stsReps == 0),
                sum(is.na(d$rowReps) | d$rowReps == 0),
                sum(!is.na(d$stsElapsed) & d$stsElapsed < 30),
                sum(!is.na(d$rowElapsed) & d$rowElapsed < 30),
                dup),
      check.names = FALSE
    )
  }, striped = TRUE, width = "100%")

  # ==========================================================================
  # EXPLORER
  # ==========================================================================
  new_title <- eventReactive(input$update_plot_title, toTitleCase(input$plot_title))
  plot_title <- reactive({
    t <- tryCatch(new_title(), error = function(e) "")
    if (!is.null(t) && nzchar(t)) t
    else paste(cont_label(input$y), "vs", cont_label(input$x))
  })

  output$scatter <- renderPlot({
    d <- df_filt(); validate(need(nrow(d) > 0, "No data to plot."))
    p <- ggplot(d, aes(x = .data[[input$x]], y = .data[[input$y]], colour = .data[[input$z]])) +
      geom_point(alpha = input$alpha, size = input$size)
    if (isTRUE(input$add_smooth))
      p <- p + geom_smooth(aes(group = 1), method = "lm", formula = y ~ x,
                           se = TRUE, colour = "grey20", linetype = 2, linewidth = 0.6)
    p +
      labs(x = cont_label(input$x), y = cont_label(input$y),
           colour = cat_label(input$z), title = plot_title()) +
      theme_minimal(base_size = 14)
  })

  # Minimal hover tooltip: nickname + the two plotted values only.
  output$hover_info <- renderUI({
    d <- df_filt(); hv <- input$plot_hover
    if (is.null(hv) || nrow(d) == 0) return(NULL)
    pt <- nearPoints(d, hv, xvar = input$x, yvar = input$y, threshold = 15, maxpoints = 1)
    if (nrow(pt) == 0) return(NULL)
    style <- sprintf("left:%fpx; top:%fpx;", hv$coords_css$x + 12, hv$coords_css$y + 12)
    div(class = "hovertip", style = style,
        tags$b(pt$nickname[1] %||% "\u2014"), tags$br(),
        sprintf("%s: %s", cont_label(input$x), fmt(pt[[input$x]][1])), tags$br(),
        sprintf("%s: %s", cont_label(input$y), fmt(pt[[input$y]][1])))
  })

  selected_pts <- reactive({
    d <- df_filt(); b <- input$plot_brush
    if (is.null(b)) return(d[0, , drop = FALSE])
    brushedPoints(d, b, xvar = input$x, yvar = input$y)
  })

  # Table shows representative fields + whichever variables are plotted.
  output$sel_table <- DT::renderDataTable({
    d <- df_filt(); s <- selected_pts()
    show <- if (nrow(s) > 0) s else d
    cols <- unique(c("nickname", "gender", "age", "totalScore", input$x, input$y))
    cols <- intersect(cols, names(show))
    DT::datatable(show[, cols, drop = FALSE], rownames = FALSE,
                  options = list(pageLength = 8, scrollX = TRUE, dom = "tip"))
  })

  stat_base <- reactive({
    s <- selected_pts()
    if (nrow(s) > 0) list(df = s, sel = TRUE) else list(df = df_filt(), sel = FALSE)
  })

  output$sel_scope <- renderText({
    b <- stat_base()
    if (b$sel) sprintf("Selected points (n = %d)", nrow(b$df))
    else sprintf("All shown points (n = %d) \u2014 drag on the plot to focus", nrow(b$df))
  })

  output$sel_desc <- renderTable({
    b <- stat_base(); base <- b$df
    validate(need(nrow(base) > 0, "No data."))
    xv <- suppressWarnings(as.numeric(base[[input$x]]))
    yv <- suppressWarnings(as.numeric(base[[input$y]]))
    one <- function(v) c(n = sum(is.finite(v)), Mean = mean(v, na.rm = TRUE),
                         SD = sd(v, na.rm = TRUE), Median = median(v, na.rm = TRUE),
                         Min = suppressWarnings(min(v, na.rm = TRUE)),
                         Max = suppressWarnings(max(v, na.rm = TRUE)))
    out <- rbind(one(xv), one(yv))
    data.frame(Variable = c(cont_label(input$x), cont_label(input$y)),
               round(as.data.frame(out), 2), check.names = FALSE)
  }, striped = TRUE, width = "100%")

  output$sel_corr <- renderUI({
    b <- stat_base(); base <- b$df
    xv <- suppressWarnings(as.numeric(base[[input$x]]))
    yv <- suppressWarnings(as.numeric(base[[input$y]]))
    ok <- is.finite(xv) & is.finite(yv); n2 <- sum(ok)
    if (n2 < 3 || input$x == input$y)
      return(helpText("Need \u2265 3 paired points and two different variables for correlation."))
    pe <- suppressWarnings(cor.test(xv[ok], yv[ok], method = "pearson"))
    sp <- suppressWarnings(cor.test(xv[ok], yv[ok], method = "spearman", exact = FALSE))
    tagList(
      tags$p(sprintf("Pearson r = %.2f (p = %s)", pe$estimate, fmt_p(pe$p.value))),
      tags$p(sprintf("Spearman \u03c1 = %.2f (p = %s)", sp$estimate, fmt_p(sp$p.value))),
      helpText("Counts are often non-normal \u2014 prefer Spearman. Correlation \u2260 causation ",
               "(README \u00a78.4).")
    )
  })

  # ==========================================================================
  # DISTRIBUTIONS
  # ==========================================================================
  dist_obj <- reactive({
    d <- df_filt(); v <- input$d_var; f <- input$d_fill
    validate(need(nrow(d) > 0, "No data."))
    if (f != "None") p <- ggplot(d, aes(x = .data[[v]], fill = .data[[f]]))
    else             p <- ggplot(d, aes(x = .data[[v]]))
    if (input$d_type == "Histogram")
      p <- p + geom_histogram(bins = input$d_bins, position = "identity",
                              alpha = 0.6, colour = "white")
    else
      p <- p + geom_density(alpha = 0.4)
    p + labs(x = cont_label(v), y = if (input$d_type == "Histogram") "Count" else "Density",
             fill = if (f != "None") cat_label(f) else NULL,
             title = sprintf("%s of %s", input$d_type, cont_label(v))) +
      theme_minimal(base_size = 14)
  })
  output$dist_plot <- renderPlot(dist_obj())

  output$dist_data <- DT::renderDataTable({
    bd <- ggplot_build(dist_obj())$data[[1]]
    if (input$d_type == "Histogram") {
      keep <- intersect(c("group", "x", "count", "density"), names(bd))
      out <- bd[, keep, drop = FALSE]
      names(out)[names(out) == "x"] <- "bin_centre"
      out[] <- lapply(out, function(z) if (is.numeric(z)) round(z, 4) else z)
    } else {
      keep <- intersect(c("group", "x", "y"), names(bd))
      out <- bd[, keep, drop = FALSE]
      if ("x" %in% names(out)) names(out)[names(out) == "x"] <- "value"
      if ("y" %in% names(out)) names(out)[names(out) == "y"] <- "density"
      out <- out[seq(1, nrow(out), length.out = min(nrow(out), 200)), , drop = FALSE]
      out[] <- lapply(out, function(z) if (is.numeric(z)) round(z, 4) else z)
    }
    DT::datatable(out, rownames = FALSE, options = list(pageLength = 10, scrollX = TRUE))
  })

  # ==========================================================================
  # GROUP COMPARISON
  # ==========================================================================
  group_obj <- reactive({
    d <- df_filt(); gy <- input$g_y; gx <- input$g_x
    validate(need(nrow(d) > 0, "No data."))
    d <- d[!is.na(d[[gx]]) & is.finite(d[[gy]]), , drop = FALSE]
    p <- ggplot(d, aes(x = .data[[gx]], y = .data[[gy]], fill = .data[[gx]]))
    if (input$g_type == "Boxplot") p <- p + geom_boxplot(alpha = 0.7, outlier.alpha = 0.4)
    else                          p <- p + geom_violin(alpha = 0.6, trim = FALSE)
    if (isTRUE(input$g_jitter))
      p <- p + geom_jitter(width = 0.12, height = 0, alpha = 0.5, size = 1.6)
    p + labs(x = cat_label(gx), y = cont_label(gy), fill = cat_label(gx),
             title = sprintf("%s by %s", cont_label(gy), cat_label(gx))) +
      theme_minimal(base_size = 14) + theme(legend.position = "none")
  })
  output$group_plot <- renderPlot(group_obj())

  # Five-number summaries isolated from the boxplot layer.
  output$group_stats <- renderTable({
    d <- df_filt(); gy <- input$g_y; gx <- input$g_x
    d <- d[!is.na(d[[gx]]) & is.finite(d[[gy]]), , drop = FALSE]
    validate(need(nrow(d) > 0, "No data."))
    agg <- do.call(rbind, lapply(split(d[[gy]], droplevels(d[[gx]])), function(v) {
      q <- quantile(v, c(0, .25, .5, .75, 1), na.rm = TRUE)
      c(n = length(v), Min = q[1], Q1 = q[2], Median = q[3], Q3 = q[4], Max = q[5], Mean = mean(v, na.rm = TRUE))
    }))
    data.frame(Group = rownames(agg), round(as.data.frame(agg), 2),
               row.names = NULL, check.names = FALSE)
  }, striped = TRUE, width = "100%")

  # Test auto-selected by number of groups + a normality screen (README §8.2).
  output$group_test <- renderPrint({
    d <- df_filt(); gy <- input$g_y; gx <- input$g_x
    d <- d[!is.na(d[[gx]]) & is.finite(d[[gy]]), , drop = FALSE]
    g <- droplevels(factor(d[[gx]])); y <- d[[gy]]
    k <- nlevels(g)
    if (k < 2) { cat("Need at least two non-empty groups."); return(invisible()) }
    if (any(table(g) < 3)) { cat("At least one group has < 3 observations; interpret with caution.\n") }
    # crude normality screen on residuals
    normalish <- tryCatch({
      res <- residuals(lm(y ~ g))
      length(res) >= 3 && length(res) <= 5000 && shapiro.test(res)$p.value > 0.05
    }, error = function(e) FALSE)
    if (k == 2) {
      if (normalish) print(t.test(y ~ g))
      else { cat("Groups not clearly normal \u2014 using Mann\u2013Whitney U (Wilcoxon rank-sum).\n\n")
             print(suppressWarnings(wilcox.test(y ~ g))) }
    } else {
      if (normalish) { cat("One-way ANOVA:\n\n"); print(summary(aov(y ~ g))) }
      else { cat("Residuals not clearly normal \u2014 using Kruskal\u2013Wallis.\n\n")
             print(kruskal.test(y ~ g)) }
    }
  })

  # ==========================================================================
  # STATION COMPARISON (standardised, README §8.3)
  # ==========================================================================
  station_df <- reactive({
    d <- df_filt()
    validate(need(sum(is.finite(d$stsReps)) >= 2 && sum(is.finite(d$rowReps)) >= 2,
                  "Not enough data to standardise."))
    d$z_sts <- as.numeric(scale(d$stsReps))
    d$z_row <- as.numeric(scale(d$rowReps))
    d
  })
  output$station_plot <- renderPlot({
    d <- station_df()
    ggplot(d, aes(x = z_sts, y = z_row, colour = .data[[input$s_colour]])) +
      geom_abline(slope = 1, intercept = 0, linetype = 2, colour = "grey50") +
      geom_hline(yintercept = 0, colour = "grey85") +
      geom_vline(xintercept = 0, colour = "grey85") +
      geom_point(alpha = 0.8, size = 3) +
      labs(x = "Sit-to-Stand (z-score)", y = "Seated Row (z-score)",
           colour = cat_label(input$s_colour),
           title = "Standardised station performance") +
      theme_minimal(base_size = 14)
  })
  output$station_data <- DT::renderDataTable({
    d <- station_df()
    cols <- c("nickname", "gender", "age", "stsReps", "rowReps",
              "z_sts", "z_row", "sts_share", "row_share", "totalScore")
    out <- d[, intersect(cols, names(d)), drop = FALSE]
    num <- sapply(out, is.numeric)
    out[num] <- lapply(out[num], round, 2)
    DT::datatable(out, rownames = FALSE, options = list(pageLength = 10, scrollX = TRUE))
  })

  # ==========================================================================
  # CORRELATIONS
  # ==========================================================================
  corr_long <- reactive({
    d <- df_filt(); vars <- input$c_vars
    validate(need(length(vars) >= 2, "Select at least two variables."))
    m <- suppressWarnings(as.matrix(sapply(d[vars], as.numeric)))
    method <- tolower(input$c_method)
    cm <- suppressWarnings(cor(m, use = "pairwise.complete.obs", method = method))
    long <- expand.grid(Var1 = colnames(cm), Var2 = colnames(cm),
                        stringsAsFactors = FALSE)
    long$r <- mapply(function(a, b) cm[a, b], long$Var1, long$Var2)
    long
  })
  output$corr_plot <- renderPlot({
    long <- corr_long()
    lv <- input$c_vars
    long$Var1 <- factor(long$Var1, levels = lv); long$Var2 <- factor(long$Var2, levels = rev(lv))
    ggplot(long, aes(x = Var1, y = Var2, fill = r)) +
      geom_tile(colour = "white") +
      geom_text(aes(label = sprintf("%.2f", r)), size = 3.4) +
      scale_fill_gradient2(low = "#d73027", mid = "white", high = "#1a9850",
                           midpoint = 0, limits = c(-1, 1)) +
      scale_x_discrete(labels = function(z) vapply(z, cont_label, "")) +
      scale_y_discrete(labels = function(z) vapply(z, cont_label, "")) +
      labs(x = NULL, y = NULL, fill = paste0(input$c_method, "\n r"),
           title = sprintf("%s correlation matrix (pairwise complete)", input$c_method)) +
      theme_minimal(base_size = 13) +
      theme(axis.text.x = element_text(angle = 40, hjust = 1))
  })
  output$corr_data <- DT::renderDataTable({
    long <- corr_long()
    out <- data.frame(Variable_1 = vapply(long$Var1, cont_label, ""),
                      Variable_2 = vapply(long$Var2, cont_label, ""),
                      r = round(long$r, 3), check.names = FALSE)
    out <- out[out$Variable_1 != out$Variable_2, ]
    DT::datatable(out, rownames = FALSE, options = list(pageLength = 10, scrollX = TRUE))
  })

  # ==========================================================================
  # LEADERBOARD & DATA
  # ==========================================================================
  output$leaderboard <- DT::renderDataTable({
    d <- df_filt(); validate(need(nrow(d) > 0, "No data."))
    d <- d[order(-d$totalScore), ]
    d <- head(d, input$top_n)
    cols <- c("nickname", "totalScore", "stsReps", "rowReps", "age", "gender", "timestamp_parsed")
    out <- d[, intersect(cols, names(d)), drop = FALSE]
    names(out)[names(out) == "timestamp_parsed"] <- "timestamp"
    DT::datatable(out, rownames = FALSE, options = list(pageLength = 15, dom = "tp"))
  })
  output$full_table <- DT::renderDataTable({
    d <- df_filt(); validate(need(nrow(d) > 0, "No data."))
    out <- d[, intersect(ALL_FIELDS, names(d)), drop = FALSE]
    DT::datatable(out, rownames = FALSE, filter = "top",
                  options = list(pageLength = 10, scrollX = TRUE))
  })
}

shinyApp(ui = ui, server = server)
